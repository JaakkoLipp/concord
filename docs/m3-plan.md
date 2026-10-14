# M3 plan: production and media validation

Status: signed off by Jaakko on 2026-10-14, with changes: no healthchecks.io, and invites in our client before the tester evening (task 7). Implements the M3 section of [milestones.md](milestones.md) by following [vps-runbook.md](vps-runbook.md), with the corrections below. Results go in `docs/m3-results.md`.

Working agreement, as in M2:
- Each finished task is committed and pushed, with `pnpm verify` run right before the commit.
- Probes run in the scratchpad first, and their side effects are listed.
- Device checks are collected, not waited for. The exceptions are the ones that gate the wipe or need testers.
- The wipe in task 5 waits for Jaakko's explicit go.

## Checked while planning

Read-only checks of the VPS and DNS, one reversible TURN probe on the VPS, and four Sonnet research agents covering Stoat's mail code, email relays, Hetzner and LiveKit's TURN source.

| Question | Answer |
|---|---|
| What is on the VPS already? | A Hetzner Cloud server in `hel1-dc2`: 2 vCPU, 3.7 GB, Ubuntu 26.04, kernel 7.0. It already has fail2ban with the sshd jail, unattended security upgrades without automatic reboot, key-only SSH with root login off, and ufw. **Runbook section 1 step 5 is done.** |
| Does HTTP/3 work? | No. Caddy advertises `h3` in `Alt-Svc`, but UDP 443 is not published, so browsers try it and fall back. The port rebinding in task 1 fixes this. |
| DNS | Cloudflare, DNS only, with an A record for `concord.jaalip.com`. There is **no AAAA record**, no `turn.` record, and no SPF, DKIM or DMARC. |
| Unknown `/app` paths | `/app/nope` still answers 500. |
| How Stoat sends mail | It uses lettre 0.10.4 directly, with no separate auth service. Settings: `use_starttls = true` with `port = 587` gives required STARTTLS. `use_tls = false` would send credentials in plain text. Stoat sends five mails: verification, password reset, a reset for sign-ups with an existing email, deletion and suspension. `from_address` is also the envelope sender. |
| EHLO, issue #223 | The EHLO name is the container's hostname, which is the container ID. Setting `hostname:` on the `api` service fixes it without patching Stoat. Six relays were tested with just an EHLO and no mail sent: Brevo, Scaleway, Lettermint, Mailjet, MailerSend and Mailgun EU. All accepted the container ID. So this fix is held in reserve. |
| Wrapped links, issue #274 | Stoat's verification line is always long enough to be quoted-printable encoded. No setting avoids it. Gmail and Outlook decode it, and our M6 pages will replace these mails' links anyway. The relay test checks it by clicking the link in the received mail. |
| Which relay | **Scaleway Transactional Email**: Paris company, data in France, 300 mails a month free, then €0.25 per 1,000, no click tracking. Brevo rewrites links for click tracking and can't turn it off on SMTP, which would wrap every verification link. Lettermint (Netherlands, free, no card) is the fallback. |
| LiveKit's TURN | Stoat's LiveKit image `v1.9.14` is a fork of LiveKit 1.13.4. With TURN on, LiveKit hands clients `turns:<domain>:443` (port 443 is hard-coded) and `turn:<node IP>:3478`. The node IP is the main IP, never the floating one. **So UDP 3478 must be on the main IP**, unlike runbook section 4 and architecture sections 5.3 and 8. The relay ports default to 30000–40000, so we set 30000–30100 and publish them. LiveKit reads the certificate once at start and **refuses to start if the file is missing**, which takes all voice down. |
| TURN inside Docker's bridge network | Risky in theory: the TURN relay inside the container sends media to the main IP's published ports, a hairpin through Docker's NAT. **Probed on the VPS**: UDP TURN on the main IP, then a headless relay-only join through the test page with a fake 1080p60 share. It connected through `turn:<main IP>:3478`, and 5 MB of video went through the relay in 12 seconds. Chrome reports the selected candidate as `prflx` with `relayProtocol: udp`, not as `relay`, so checks look at `relayProtocol` and the TURN URL. Bridge networking works, and LiveKit doesn't need host networking. |
| Caddy's certificate for `turn.` | Stored at `certificates/acme-v02.api.letsencrypt.org-directory/turn.concord.jaalip.com/` under Caddy's data directory. Caddy falls back to ZeroSSL, which would change the path. So the site block pins Let's Encrypt and turns off the TLS-ALPN challenge, which can't work while LiveKit owns 443 on that address. In bridge mode Caddy can't `bind` the floating IP. Docker publishes `<floating IP>:80` to Caddy instead. |
| Hetzner | Floating IPv4: €3.00 a month. Cloud Firewall: free. It filters inbound traffic by source only and applies per server, so it opens the union of all ports. Storage Box BX11: 1 TB, about €3.20 a month, available in Helsinki, restic over SFTP on port 23. CX23 (2 vCPU, 4 GB): €5.49 a month or €0.0088 an hour. CX33 (4 vCPU, 8 GB): €8.49. Prices rose on 15 June 2026, and resizing an existing server moves it to the new prices. CX plans may be out of stock in Helsinki, but a drill machine can run anywhere. |
| Upstream | The self-hosted repo still pins 0.15.5 at `9af5e90`. Stoat 0.16.0-rc.1 came out on 13 October. |
| Docs out of date | `deploy/revolt-changes.md` section 3 names an ID that is no longer the one in `Revolt.toml`, which today is `dev-admin`. |

**Side effects**:
- LiveKit restarted twice.
- UDP 3478 and 30000–30100 were open on the main IP for about two minutes.
- The persona `aino` has three new sessions called "M0 screen-share test". This is dev data, and the wipe removes it.
- `livekit.yml` is back to its original content, and the temporary files are deleted.

A Sonnet challenger reviewed the first draft, and this version includes its fixes.

**Changed after sign-off, 2026-10-14**: Jaakko can't use Scaleway or another outside mail provider, and the Storage Box waits until later.
- **No email in M3.** Production runs without an SMTP server, so Stoat creates accounts already verified. `account-link.sh` writes a one-time password link into the account, and Jaakko sends that link to the person. The new task 2 has the details. Real email moves to M6: Cloudflare Email Sending through a small bridge, or our own sender once Hetzner unblocks port 25.
- **Backups go to the VPS's own disk.** The Storage Box comes later as a second copy.

## Jaakko's part, in order

Items 2 and 3 can be done now, in any order. Items 5 to 8 come when a task asks. Added monthly cost: €3 for the floating IP.

1. Dropped: Scaleway. There is no email in M3, as described above.
2. **Hetzner console**:
   1. **Floating IP**: done on 2026-10-14. The address lives only in `host.env` on the server.
   2. **DNS**: done on 2026-10-14. `turn.concord` points at the floating IP and `ref.concord` at the main IP.
   3. **Firewall**: Firewalls → Create "concord":
      - Inbound TCP 22, 80, 443 and 7881.
      - Inbound UDP 443, 3478, 30000-30100 and 50000-50100.
      - Inbound ICMP.
      - Apply it to the server.
   4. **Storage Box**: later, as a second copy of the backups.
3. **A second address**: Jaakko's other Outlook address, for a second account. A `+` or dotted variant won't work, because Stoat treats those as the same address. No mail is sent to it in M3.
4. Dropped: healthchecks.io. Decision 9 explains.
5. **Your accounts after the wipe**, in task 5:
   - Make a link for your own account and one for your second address, with one command each, and set both passwords through them.
   - Turn on TOTP on your main account.
   - Create the community server in our client.
   - Post a few messages and an image, and set an avatar. The restore drill checks these.
6. **A temporary machine for the restore drill**, in task 6:
   - A CX23 in any location, Ubuntu 26.04, with your SSH key. It costs cents.
   - An A record `drill.concord` → its address.
   - Delete both after the drill.
7. **Before the tester evening**: M0's encoder runs 1 to 4, Chrome on Windows, from m0-results.md section 3. You can do them alone, with your two accounts after the wipe or with personas before it.
8. **Testers**: at least three people besides you, on different networks, for task 8.
   - At least one joins from a phone on mobile data.
   - Ideally one is on a restrictive network, such as a workplace or a school.
   - Make each person's link with one command, so their addresses never reach the chat or the repo, and send it to them yourself. Book an evening of about two hours.

## Decisions

1. **The wipe doesn't wait for M2's device checks.** M2's device checks, the 30-minute two-machine session and the M0 encoder runs work with any two accounts, so they move to production after the wipe:
   - You run them with your main and second accounts on two machines.
   - Building the community server in task 5 is the M2c "build a server as admin" check.
   - A tester joins in for the friend request, DM and group checks, by text, on any day after task 7.
   - M2 is signed off when these pass, and milestones.md says so.
   - Recommended, because nothing else needs the dev data. The cost: a bug found after the wipe is reproduced on production or on M4's dev stack, not with seeded data.
2. **No email in M3; accounts get password links instead.** This replaces the Scaleway relay. Real email waits for M6.
3. **TURN layout**:
   - TLS on 443 on the floating IP.
   - UDP 3478 and the relay ports 30000–30100 on the main IP.
   - LiveKit stays on Docker's bridge network, as the probe showed it can.
   - Task 9 corrects runbook section 4 and architecture sections 5.3 and 8 to match.
4. **TURN runs before the wipe** if the floating IP arrives in time. A TURN mistake then lands before real people are on the stack, and the scripted relay check can still use a persona.
   - If the wipe comes first, you run the check once with your second account.
   - The tester evening proves the forced-relay criterion either way.
5. **No permanent check account on production.** Agents check production through HTTP and the database, and through your accounts only when you run a check yourself.
6. **The dev stack moves to M4**, as M4's first task. It would be a CX23 at `dev.concord.jaalip.com`, about €5.49 a month, where the seed and live checks point by default.
   - M3 keeps the seed working for it: the stack's dev parts are switched by one marker, and the seed refuses any stack without it.
   - Recommended: it keeps M3 to production. Until M4, nothing needs personas.
7. **No Stoat upgrade in M3.** 0.16 is a release candidate and the self-hosted repo still pins 0.15.5. If the self-hosted repo moves its pin during M3, the upgrade drill runs on the drill machine. Any upgrade must re-check the two Stoat bugs in client.md section 7.
8. **Automatic reboots for security updates, at 05:30**, only when an update needs one.
   - That is after the 03:30 backup and the Monday 05:00 LiveKit restart.
   - Without them, kernel fixes wait for someone to remember.
   - Task 3's reboot test proves the floating IP and the whole stack come back on their own.
   - The cost: a reboot of about two minutes, roughly monthly.
   - Recommended.
9. **No alerting in M3.** With no email, a failed backup or a disk over 85% full is written to the system log under the `concord` tag, and `deploy/status.sh` shows the last backup and the disk use. External monitoring waits for M8, as milestones.md plans.
10. **Backups keep 7 daily, 4 weekly and 6 monthly snapshots.** The restic password lives on the VPS and in your password manager. Without it, the backups can't be read, and it can't usefully live inside them.
11. **Fix the `/app` 404 in M3**, because testers will hit it. Small.

## Tasks

The default order is below. Task 1 needs nothing from Jaakko, and the others start as Jaakko's items arrive. Each task ends with `pnpm verify`, a commit and a push.

### 1. Production configuration that needs no new address

- **Addresses**: a server-only `concord/host.env` holds the domain, the main IPv4 and IPv6, the floating IP and `TURN=on|off`. No address or domain is committed: concord-web's `ORIGIN` comes from the domain in `host.env`. `dc` reads the file after Stoat's `.env`, so the drill machine and M4's dev stack use the same compose files.
- **Caddy**: binds the main IPv4 and IPv6 on 80 and 443 over TCP, and 443 over UDP, using `!override`.
- **LiveKit**: `deploy/livekit.yml` is the generated config without its `keys` section, with TURN off. The keys move to a server-only `livekit.env`, read as `LIVEKIT_KEYS`.
- **Dev-only parts**: Mailpit moves to `deploy/dev.compose.yml`. `dc` adds that file only when `concord/.allow-wipe` exists, so one marker means "dev stack". `revolt-changes.md` keeps the Mailpit block as the dev variant, and its stale admin ID is fixed.
- **Safety**:
  - The seed refuses any stack without `.allow-wipe`, not only when it resets.
  - `net.ipv4.ip_nonlocal_bind=1` is set.
  - `pnpm verify` fails on any personal-mailbox address, such as Gmail or Outlook, in a tracked file.
- **`create-account.sh`**: with no password given, it makes a random one and doesn't print it. That is the hand-made account flow from runbook section 3.
- **`/app`**: unknown paths answer 404.
- **Done when**:
  - The stack restarts cleanly.
  - A Chromium check sees `h3` on a second load of `/app`.
  - `/app/nope` answers 404.
  - The probe's direct voice join still connects.
  - A direct account-create call from WSL gets 403.

### 2. Accounts without email

- **Production has no SMTP server.** `[api.smtp]` keeps `host = ""`, so Stoat creates accounts already verified and sends nothing. Stoat's own "Forgot password" then fails, and deleting an account in Stoat's client happens at once, with no confirmation mail.
- **`deploy/account-link.sh <email>`**:
  - Creates the account with a random, unseen password if it doesn't exist yet.
  - Writes a one-time password-reset token into the account, valid for 7 days. Stoat's own reset endpoint accepts it, and its upstream test does the same thing.
  - Prints `https://<domain>/app/welcome/<token>`, optionally with `?invite=<code>`.
  - Run for an existing account, it gives a fresh link, so it is also Jaakko's "forgot password" for someone.
- **`/app/welcome/<token>` in our client**:
  - The person chooses a password, which goes through `PATCH /auth/account/reset_password`.
  - Then they log in, pick a username, and continue to the invite if the link had one.
  - An expired or used token says to ask for a new link.
- **New check**: `tools/live/src/welcome.ts` walks through a link for a throwaway account on the dev stack.
- **Done when**:
  - A link sets the password, and the person ends in the invited server.
  - A used link is refused.

### 3. Floating IP, firewall and TURN (needs item 2)

- **Floating IP**: it goes in `/etc/netplan/60-floating-ip.yaml`, following Hetzner's guide, applied with `netplan try`. Then reboot once and confirm the address is present and every container is up.
- **Firewall check**: publish a throwaway container on a port the firewall doesn't open, on the main IPv4, the IPv6 and the floating IP. All three must time out from WSL or the drill machine. Remove the container afterwards.
- **Certificate for `turn.`**:
  - A `turn.concord.jaalip.com` block that returns 404, pinned to Let's Encrypt with TLS-ALPN off.
  - `<floating IP>:80` published to Caddy.
  - **The certificate must be on disk before TURN is switched on.**
- **TURN is one switch**: `deploy/turn.compose.yml` holds:
  - the ports: `<floating IP>:443/tcp`, and on the main IP `3478/udp` and `30000-30100/udp`,
  - the certificate directory, mounted read-only,
  - `deploy/livekit-turn.yml`, which is `livekit.yml` plus the TURN section.

  `dc` adds it when `host.env` says `TURN=on`. With `TURN=off` the stack runs exactly as today, which is the fallback if the certificate is ever missing.
- **Certificate renewal**: a cron file in `deploy/` restarts LiveKit at 05:00 every Monday, only if the certificate file is present and readable.
- **Automatic reboot**, from decision 8.
- **New check**: `tools/live/src/turn.ts`, a relay-only join that keeps only the `turns:` server and asks for its credentials at run time.
- **Done when**:
  - The reboot and firewall checks pass.
  - `turn.ts` shows a selected candidate with `relayProtocol: "tls"` from the `turns:` URL, and video bytes flowing.

### 4. Backups

- **Install**: restic, from Ubuntu's packages on the VPS.
- **`deploy/backup.sh`** runs nightly at 03:30:
  - A MongoDB dump goes straight into restic.
  - Then, back to back:
    - the object storage data, `secrets.env`, `Revolt.toml`, `.env`, `.env.web`, `host.env` and `livekit.env`,
    - the netplan file and Caddy's data.
  - The committed files in `deploy/` are not backed up, because git has them.
  - Retention per decision 10, and a weekly `restic check`.
  - The disk check and the log entries, per decision 9.
- **Where**: a restic repository on the VPS's own disk, under `/var/backups/concord`, owned by root. The Storage Box is added later as a second repository. Until then, a backup doesn't survive losing the VPS.

- **Done when**:
  - The first snapshot is listed and `restic check` passes.
  - A forced failure shows in the system log and in `status.sh`.

### 5. Wipe and bootstrap (needs Jaakko's go and task 2)

1. Run `reset-data.sh` without seeding. It also resets `restrict_server_creation` to the placeholder that matches nobody.
2. Delete `.allow-wipe`, and run `dc up -d --remove-orphans` so Mailpit is removed.
3. Jaakko makes a link for their own account, sets the password through it, picks a username and turns on TOTP.
4. Set `restrict_server_creation` to Jaakko's ID and record the change.
5. Jaakko makes the second account the same way. That is the hand-made flow, end to end. Then confirm it gets an error creating a server and sees no create or invite controls.
6. Jaakko creates the community server in our client at `/app`. Then check that Everyone lacks `InviteOthers` and Admin is first with every permission.
7. Jaakko invites the second account, then posts a few messages and an image and sets an avatar.
- **Done when**:
  - The steps above pass.
  - An account-create call from outside still gets 403.
  - The first backup after the wipe holds this data.

### 6. Restore drill (needs item 6, a night after task 5)

1. **Prepare the drill machine**:
   - Set it up with `server-setup.sh` and the self-hosted repo at `9af5e90`.
   - Copy last night's restic repository and its password from the VPS. Both are deleted with the machine.
2. **Restore last night's snapshot.**
3. **Change these before the first start**:
   - `pushd` stopped, so it can't push to real browsers.
   - `host.env` with its own addresses and `TURN=off`.
   - The hostname `drill.concord.jaalip.com`.
4. **Checks**:
   - Scripted:
     - Account, message and attachment counts match production's at backup time.
     - The image and the avatar download with the same hashes.
   - Jaakko logs in with the second account at `drill.concord.jaalip.com/app` and sees the messages, the image and the avatar.
   - From the drill machine, `curl -6` reaches production's IPv6 on ports 80 and 443. Then Jaakko adds the AAAA record for `concord`, with the main IPv6 address, which I give in the chat at that step.
5. **Time the restore**, then delete the machine and the `drill` record.
- **Done when**:
  - The checks pass.
  - The runbook has a disaster-recovery section: move the floating IP first, restore, check that the TURN certificate exists, and only then set `TURN=on`.

### 7. Invites and the front door (needs item 2.2's `ref.concord` record and task 5)

Jaakko wants invites working before testers join. This pulls part of M6 forward, without registration, which stays closed: testers' accounts are still made by hand.

- **Invite page**: our client gets `/app/invite/<code>`. It shows the server's name and icon from `GET /invites/<code>`, then Join.
  - Logged out, it asks you to log in first and comes back to the invite.
  - If you are already a member, it opens the server.
  - Group DM and bad codes get a clear message.
- **Caddy**:
  - `/invite/*` redirects to `/app/invite/*`, so links made in our client work as they are.
  - `/` redirects to `/app`.
- **Stoat's client moves to `ref.concord.jaalip.com`**, served by the same `web` container.
  - A probe first checks that Stoat's client works from the other origin: logging in, the socket, an upload and a voice join.
- **New check**: `tools/live/src/invite.ts` runs the invite flow as the second account, logged out and logged in.
- **Done when**:
  - An invite link opened on a phone, by an account that isn't a member yet, ends in the server.
  - Stoat's client works at `ref.`.

### 8. The tester evening (needs items 7 and 8, and tasks 3, 5 and 7)

**Before**:
- Jaakko's M0 encoder runs 1 to 4, Chrome on Windows. They choose the codec for the evening, and Jaakko can do them alone.
- A one-page tester guide.
- A `docker stats` logger on the VPS.

**On the evening**, in order:
1. A TOTP login and a recovery-code login on the second account.
2. Voice in Stoat's client at `ref.concord.jaalip.com` for 30 minutes, with four or more people on different networks, at least one on mobile data.
   - **Pass**: nobody is dropped or loses audio for more than a few seconds, and there is no one-way audio.
   - Echo is noted, but it is a client issue.
3. Screen share on the test page:
   - **Windows to two viewers on other home networks**, with the codec chosen from the encoder runs. Pass: at least one viewer gets 1920 × 1080 at an average of 55 fps or more over two minutes. Measure the downlink of any viewer who gets less.
   - **Forced relay with UDP 3478 closed in the Hetzner firewall.** Pass: the test page shows the connection going `via tls`, and video plays. It may say `prflx` rather than `relay`, which still counts. Reopen the port afterwards.
   - **A phone or throttled viewer.** Pass: it steps down a layer within about ten seconds and never freezes for more than two seconds.

**Done when** each pass is recorded or its failure explained. The VPS is resized to a CX33 only if dev-environment.md section 2's thresholds are crossed.

### 9. Results, docs and decision gate part B

- **`docs/m3-results.md`**: versions, the gate test, the screen-share table, the TURN result, the resource table, time spent, every manual repair, and a verdict against criteria 3, 4 and 5.
- **Docs**:
  - Fix runbook section 4 and architecture sections 5.3 and 8 for decision 3.
  - Mark what M3 did in the runbook.
  - Update dev-environment.md section 8, and milestones.md for decisions 1 and 6.
- **Review**: a Sonnet review of the session's whole diff.
- **Handoff**: write the M4 prompt in `next-session-prompt.md`, with the dev stack as M4's first task.

## Not in M3

- Opening registration, and our own verify, reset and account pages: M6.
- The dev stack: M4, per decision 6.
- External uptime monitoring: M8.
- The private-channel product call from m2c-results.md.
- The items in m2c-plan.md decision 7.
