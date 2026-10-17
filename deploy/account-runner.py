#!/usr/bin/env python3
"""
The account runner: the one place that changes Stoat accounts and our two global roles for the admin view.

Concord's layer (concord-web) must never hold root or Docker, so it only asks. It writes one small JSON file per
request into spool/in, which is the single folder it may write. This script, run on the host (as root on the VPS,
by systemd; as the user on the local stack), reads each request, checks it, does one thing from a fixed list with
the stack's own tools, and writes the answer into spool/out, which the container can only read.

What it trusts: nothing in a request but its shape. Names, IDs and the action are matched against exact patterns, a
request that is not a small regular file is dropped, nothing from a file reaches a shell, and every rule below is
enforced here, again, whatever the layer checked.

The actions (each is one request {"action", "user", "by"}):
  moderator:add / moderator:remove   Stoat's server-creator list (set-server-creators.sh; api restarts for seconds)
  admin:add / admin:remove           ADMIN_USER_IDS in host.env; concord-web restarts
  password-link                      a one-time /app/welcome link for the person, like account-link.sh --reset
  suspend / unsuspend                disable the account and end its sessions, or undo that

The rules: only an admin may ask. The first ID in ADMIN_USER_IDS is the owner: nobody removes or suspends them or
resets their password but themselves. Nobody removes or suspends themself, an admin can't be suspended or have
their password reset by another admin, and the admin list never ends up empty.

It also writes spool/out/users.json every 30 seconds: ID, name, whether disabled. No emails.

Usage: concord/account-runner.py loop     run until stopped (one at a time: it takes a lock)
       concord/account-runner.py once     handle what is waiting, refresh users.json, and exit
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import secrets
import stat
import string
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

CONCORD = Path(__file__).resolve().parent
STACK = CONCORD.parent
SPOOL = CONCORD / "spool"
IN = SPOOL / "in"
OUT = SPOOL / "out"
DC = str(CONCORD / "dc")

ULID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")
REQUEST_NAME = re.compile(r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.req\.json$")
TMP_NAME = re.compile(r"^\.[0-9a-f-]{36}\.tmp$")
TMP_GRACE_SECONDS = 60
NOBODY = "00000000000000000000000000"
ACTIONS = {"moderator:add", "moderator:remove", "admin:add", "admin:remove", "password-link", "suspend", "unsuspend"}
MAX_REQUEST_BYTES = 2048
MAX_PER_PASS = 20
RESULT_KEEP_SECONDS = 300
USERS_EVERY_SECONDS = 30


class Refused(Exception):
    """A rule said no. The message is shown to the admin, so it says why in plain words."""


def log(message: str) -> None:
    print(f"account-runner: {message}", flush=True)


# --- Stoat's data and our files ---------------------------------------------------------------------------------

def run(args: list[str], env: dict[str, str] | None = None, timeout: int = 120) -> str:
    done = subprocess.run(args, cwd=STACK, capture_output=True, text=True, timeout=timeout, env={**os.environ, **(env or {})})
    if done.returncode != 0:
        raise RuntimeError(f"{Path(args[0]).name} failed: {done.stderr.strip()[:300] or done.stdout.strip()[:300]}")
    return done.stdout


def mongo(script: str, **env: str) -> str:
    """Run mongosh with the values as environment variables, so nothing is ever put into the script text."""
    args = [DC, "exec", "-T"]
    for key, value in env.items():
        args += ["-e", f"{key}={value}"]
    return run(args + ["database", "mongosh", "--quiet", "revolt", "--eval", script]).strip()


def read_ids(path: Path, pattern: str) -> list[str]:
    for line in path.read_text().splitlines():
        match = re.match(pattern, line)
        if match:
            return [i for i in re.split(r"[\s,\"']+", match.group(1)) if ULID.match(i) and i != NOBODY]
    return []


def admins() -> list[str]:
    return read_ids(CONCORD / "host.env", r"^ADMIN_USER_IDS=(.*)$")


def moderators() -> list[str]:
    return read_ids(STACK / "Revolt.toml", r"^restrict_server_creation = \[(.*)\]\s*$")


def user_state(user: str) -> dict:
    """The user and their account, or a refusal: bots and people who never finished onboarding have no account to manage."""
    out = mongo(
        'const u = db.users.findOne({ _id: process.env.USER_ID }); const a = db.accounts.findOne({ _id: process.env.USER_ID });'
        'print(JSON.stringify(u && a && !u.bot ? { name: u.username + "#" + u.discriminator, disabled: a.disabled === true } : null))',
        USER_ID=user,
    )
    state = json.loads(out.splitlines()[-1] if out else "null")
    if not state:
        raise Refused("That person has no account here.")
    return state


# --- The actions ------------------------------------------------------------------------------------------------

def set_moderators(ids: list[str]) -> None:
    run([str(CONCORD / "set-server-creators.sh"), *ids], timeout=180)


def set_admins(ids: list[str]) -> None:
    path = CONCORD / "host.env"
    lines = path.read_text().splitlines()
    value = f"ADMIN_USER_IDS={','.join(ids)}"
    if any(line.startswith("ADMIN_USER_IDS=") for line in lines):
        lines = [value if line.startswith("ADMIN_USER_IDS=") else line for line in lines]
    else:
        lines.append(value)
    # host.env holds the server's other settings too, so a crash must never leave half of it: write a private copy
    # with the same owner and mode, then rename it over the file. Compose reads the file again on the next up.
    info = path.stat()
    tmp = path.with_name(".host.env.new")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write("\n".join(lines) + "\n")
    try:
        os.chown(tmp, info.st_uid, info.st_gid)
    except PermissionError:
        pass
    tmp.chmod(stat.S_IMODE(info.st_mode))
    os.replace(tmp, path)
    run([DC, "up", "-d", "concord-web"], timeout=180)


def app_address() -> str:
    for line in (STACK / "Revolt.toml").read_text().splitlines():
        match = re.match(r'^app = "(.*)"$', line)
        if match:
            return match.group(1)
    raise RuntimeError("no [hosts] app in Revolt.toml")


def password_link(user: str) -> str:
    alphabet = string.ascii_letters + string.digits + "_-"
    token = "".join(secrets.choice(alphabet) for _ in range(32))
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    changed = mongo(
        'print(db.accounts.updateOne({ _id: process.env.USER_ID },'
        ' { $set: { password_reset: { token: process.env.TOKEN, expiry: process.env.EXPIRY } } }).modifiedCount)',
        USER_ID=user, TOKEN=token, EXPIRY=expiry,
    )
    if changed.splitlines()[-1] != "1":
        raise RuntimeError("could not set the link on the account")
    return f"{app_address()}/app/welcome/{token}"


def set_disabled(user: str, disabled: bool) -> None:
    mongo(
        'db.accounts.updateOne({ _id: process.env.USER_ID }, { $set: { disabled: process.env.DISABLED === "true" } });'
        'if (process.env.DISABLED === "true") db.sessions.deleteMany({ user_id: process.env.USER_ID });',
        USER_ID=user, DISABLED="true" if disabled else "false",
    )


def perform(request: dict) -> tuple[str, dict]:
    """Check the rules and do the one thing. Returns the message for the admin and any extra fields."""
    action, by, user = request["action"], request["by"], request["user"]
    admin_list = admins()
    if by not in admin_list:
        raise Refused("Only an admin can do this.")
    owner = admin_list[0]
    state = user_state(user)
    name = state["name"]

    if action == "moderator:add":
        if state["disabled"]:
            raise Refused(f"{name} is suspended.")
        current = moderators()
        if user in current:
            raise Refused(f"{name} is already a moderator.")
        set_moderators(current + [user])
        return f"{name} is a moderator.", {}
    if action == "moderator:remove":
        current = moderators()
        if user not in current:
            raise Refused(f"{name} is not a moderator.")
        set_moderators([i for i in current if i != user])
        return f"{name} is no longer a moderator.", {}
    if action == "admin:add":
        if state["disabled"]:
            raise Refused(f"{name} is suspended.")
        if user in admin_list:
            raise Refused(f"{name} is already an admin.")
        set_admins(admin_list + [user])
        return f"{name} is an admin.", {}
    if action == "admin:remove":
        if user not in admin_list:
            raise Refused(f"{name} is not an admin.")
        if user == owner:
            raise Refused("The owner stays an admin.")
        if user == by:
            raise Refused("You can't remove yourself as an admin.")
        remaining = [i for i in admin_list if i != user]
        if not remaining:
            raise Refused("There must be at least one admin.")
        set_admins(remaining)
        return f"{name} is no longer an admin.", {}
    if action == "password-link":
        if state["disabled"]:
            raise Refused(f"{name} is suspended.")
        if user in admin_list and by != user and by != owner:
            raise Refused("Only the owner can reset another admin's password.")
        if user == owner and by != owner:
            raise Refused("Only the owner can reset the owner's password.")
        return f"A one-time password link for {name}, good for 7 days.", {"link": password_link(user)}
    if action == "suspend":
        if user == by:
            raise Refused("You can't suspend yourself.")
        if user in admin_list:
            raise Refused("Remove their admin role first.")
        set_disabled(user, True)
        return f"{name} is suspended and signed out.", {}
    if action == "unsuspend":
        if not state["disabled"]:
            raise Refused(f"{name} is not suspended.")
        set_disabled(user, False)
        return f"{name} can log in again.", {}
    raise Refused("Unknown action.")


# --- The spool --------------------------------------------------------------------------------------------------

def read_request(dir_fd: int, name: str) -> dict | None:
    """One request file, or None if it isn't a small regular file with exactly the right shape."""
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dir_fd)
    except OSError:
        return None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_REQUEST_BYTES or info.st_nlink != 1:
            return None
        data = json.loads(os.read(fd, MAX_REQUEST_BYTES + 1))
    except (OSError, ValueError):
        return None
    finally:
        os.close(fd)
    if not isinstance(data, dict) or set(data) != {"action", "user", "by"}:
        return None
    if data["action"] not in ACTIONS or not all(isinstance(data[k], str) and ULID.match(data[k]) for k in ("user", "by")):
        return None
    return data


def write_result(name: str, body: dict) -> None:
    """
    Atomic, in a folder only this process writes: the container can't plant a link there. Private to the web user,
    who owns `in`, since an answer may hold a one-time password link.
    """
    tmp = OUT / f".{name}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(json.dumps(body))
    owner = IN.stat()
    try:
        os.chown(tmp, owner.st_uid, owner.st_gid)
    except PermissionError:
        pass
    os.replace(tmp, OUT / name)


def handle_requests() -> bool:
    handled = False
    dir_fd = os.open(IN, os.O_RDONLY | os.O_DIRECTORY)
    try:
        for entry in sorted(os.listdir(dir_fd))[:MAX_PER_PASS * 5]:
            if TMP_NAME.match(entry):
                # The layer writes a request under this name and then renames it: leave it a moment, not for good.
                try:
                    if time.time() - os.stat(entry, dir_fd=dir_fd, follow_symlinks=False).st_mtime < TMP_GRACE_SECONDS:
                        continue
                except OSError:
                    continue
            match = REQUEST_NAME.match(entry)
            request = read_request(dir_fd, entry) if match else None
            try:
                os.unlink(entry, dir_fd=dir_fd)
            except IsADirectoryError:
                continue
            except OSError:
                pass
            if not match:
                continue
            at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            rid = match.group(1)
            if request is None:
                write_result(f"{rid}.res.json", {"id": rid, "status": "failed", "message": "That request was not valid.", "at": at})
                continue
            handled = True
            body = {"id": rid, "by": request["by"], "action": request["action"], "user": request["user"], "at": at}
            try:
                message, extra = perform(request)
                body |= {"status": "ok", "message": message, **extra}
                log(f"{request['action']} on {request['user']} by {request['by']}: ok")
            except Refused as refusal:
                body |= {"status": "failed", "message": str(refusal)}
                log(f"{request['action']} on {request['user']} by {request['by']}: refused ({refusal})")
            except Exception as error:  # noqa: BLE001 - one bad request must not stop the runner
                body |= {"status": "failed", "message": "That didn't work. Look in the server's log."}
                log(f"{request['action']} on {request['user']} by {request['by']}: error ({error})")
            write_result(f"{rid}.res.json", body)
    finally:
        os.close(dir_fd)
    return handled


def write_users() -> None:
    out = mongo(
        'print(JSON.stringify(db.users.aggregate([{ $match: { bot: { $exists: false } } },'
        ' { $lookup: { from: "accounts", localField: "_id", foreignField: "_id", as: "a" } },'
        ' { $match: { "a.0": { $exists: true } } },'
        ' { $project: { _id: 0, id: "$_id", username: 1, discriminator: 1, displayName: "$display_name",'
        ' disabled: { $eq: [{ $arrayElemAt: ["$a.disabled", 0] }, true] } } },'
        ' { $sort: { username: 1 } }]).toArray()))'
    )
    users = json.loads(out.splitlines()[-1])
    write_result("users.json", {"updatedAt": int(time.time() * 1000), "users": users})


def clean_results() -> None:
    cutoff = time.time() - RESULT_KEEP_SECONDS
    for path in OUT.glob("*.res.json"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            pass


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode not in ("loop", "once"):
        print(__doc__)
        return 2
    for folder in (IN, OUT):
        if folder.is_symlink() or not folder.is_dir():
            print(f"missing {folder}, or it is a link: run pnpm deploy:stack", file=sys.stderr)
            return 1
    # Answers are trusted by the layer because only this process can write them: refuse if anyone else could.
    out = OUT.stat()
    if out.st_uid != os.getuid() or out.st_mode & 0o022:
        print(f"{OUT} must belong to the runner and not be writable by others", file=sys.stderr)
        return 1
    lock = open(SPOOL / "runner.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("already running")
        return 0
    (SPOOL / "runner.pid").write_text(str(os.getpid()))
    if mode == "once":
        handle_requests()
        write_users()
        clean_results()
        return 0
    log("started")
    last_users = 0.0
    while True:
        try:
            changed = handle_requests()
            if changed or time.time() - last_users > USERS_EVERY_SECONDS:
                write_users()
                last_users = time.time()
            clean_results()
        except Exception as error:  # noqa: BLE001 - keep running; systemd also restarts us
            log(f"pass failed: {error}")
        time.sleep(2)


if __name__ == "__main__":
    sys.exit(main())
