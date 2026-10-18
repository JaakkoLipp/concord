/**
 * `pnpm deploy:stack` (the local stack) or `pnpm deploy:stack:prod`: copy deploy/ to ~/stoat/concord on that stack and apply it.
 *
 * Server-only files there (host.env, livekit.env, .allow-wipe, web/, spike/, data/) are never touched: no --delete.
 * data/ holds the layer's store; this makes it, owned by uid 1000, the node user of concord-web's image.
 * Don't run it around 03:30: it rewrites backup.sh in place, which a running backup may still be reading.
 * --inplace matters: compose bind-mounts single files such as the Caddyfile, and a file replaced by rename
 * would leave the container reading the old one. Caddy is reloaded; a changed LiveKit or Revolt config still
 * needs `dc restart livekit` or `dc restart api`, which this prints rather than does.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL, SSH, onStack, sameHost, stackPath } from '../target.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });

sameHost();
console.log(`applying deploy/ on ${SSH}`);
run('rsync', ['-a', '--inplace', '--itemize-changes', '--exclude', 'web/', '--exclude', 'spike/', '--exclude', 'data/', 'deploy/', `${stackPath('stoat/concord')}/`]);
// The local stack runs in Docker Desktop: nothing is installed on the machine itself.
const host = LOCAL ? [] : [
  // The host-level files: cron jobs, automatic reboots, the sysctl for addresses that aren't up yet.
  'sudo install -m 0644 concord/concord-cron /etc/cron.d/concord',
  // The account runner's folders (architecture section 11.5), before up -d, or Docker would make them as root: the
  // container writes requests into `in` as uid 1000 and can only read `out`, which only the runner writes.
  'sudo install -d -o 1000 -g 1000 -m 0700 concord/spool/in',
  'sudo install -d -o root -g root -m 0755 concord/spool/out',
  'sudo install -m 0644 concord/concord-runner.service /etc/systemd/system/concord-runner.service',
  'sudo systemctl daemon-reload',
  'sudo systemctl enable concord-runner >/dev/null 2>&1',
  'sudo install -m 0644 concord/52concord-auto-reboot /etc/apt/apt.conf.d/52concord-auto-reboot',
  'sudo install -m 0644 concord/99-concord-net.conf /etc/sysctl.d/99-concord-net.conf',
  'sudo sysctl --quiet --system >/dev/null',
];
run(...onStack([
  'set -e; cd ~/stoat',
  'concord/dc config -q',
  // The layer's data folder, before up -d, or Docker would make it as root. Locally jaakko is uid 1000 already.
  LOCAL ? 'install -d -m 0700 concord/data' : 'sudo install -d -o 1000 -g 1000 -m 0700 concord/data',
  // The guard's record (m4.7-plan.md task 12), for its container's node user, made whether or not it is switched on.
  LOCAL ? 'install -d -m 0700 concord/guard-data' : 'sudo install -d -o 1000 -g 1000 -m 0700 concord/guard-data',
  // A broken Caddyfile would put Caddy in a crash loop once up -d recreates it: check it in the running one first.
  'concord/dc exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null',
  ...(LOCAL ? ['install -d -m 0700 concord/spool/in', 'install -d -m 0755 concord/spool/out'] : []),
  ...host,
  'concord/dc up -d --remove-orphans',
  // The runner after the stack is up, so a new script is the one running. Locally it is a background process of
  // this user, since the machine itself has no systemd units; on the VPS it is a service.
  LOCAL
    // By its pidfile, checked against the process's name: a pkill -f would match this very command line.
    ? '(p=$(cat concord/spool/runner.pid 2>/dev/null); if [ -n "$p" ] && grep -q account-runner "/proc/$p/cmdline" 2>/dev/null; then kill "$p"; sleep 1; fi; true) && (setsid nohup concord/account-runner.py loop >>concord/spool/runner.log 2>&1 &)'
    : 'sudo systemctl restart concord-runner',
  'concord/dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force',
  'concord/dc ps --format "table {{.Service}}\\t{{.Status}}"',
].join(' && ')));
console.log('applied; if livekit.yml or Revolt.toml changed, restart that service with concord/dc restart <service>');
