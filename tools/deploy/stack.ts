/**
 * `pnpm deploy:stack`: copy deploy/ to ~/stoat/concord on the VPS and apply it.
 *
 * Server-only files there (host.env, livekit.env, .allow-wipe, web/, spike/) are never touched: no --delete.
 * Don't run it around 03:30: it rewrites backup.sh in place, which a running backup may still be reading.
 * --inplace matters: compose bind-mounts single files such as the Caddyfile, and a file replaced by rename
 * would leave the container reading the old one. Caddy is reloaded; a changed LiveKit or Revolt config still
 * needs `dc restart livekit` or `dc restart api`, which this prints rather than does.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SSH = process.env.CONCORD_SSH ?? 'jaakko@concord.jaalip.com';
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });

run('rsync', ['-a', '--inplace', '--itemize-changes', '--exclude', 'web/', '--exclude', 'spike/', 'deploy/', `${SSH}:stoat/concord/`]);
run('ssh', [SSH, [
  'set -e; cd ~/stoat',
  'concord/dc config -q',
  // A broken Caddyfile would put Caddy in a crash loop once up -d recreates it: check it in the running one first.
  'concord/dc exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null',
  // The host-level files: cron jobs, automatic reboots, the sysctl for addresses that aren't up yet.
  'sudo install -m 0644 concord/concord-cron /etc/cron.d/concord',
  'sudo install -m 0644 concord/52concord-auto-reboot /etc/apt/apt.conf.d/52concord-auto-reboot',
  'sudo install -m 0644 concord/99-concord-net.conf /etc/sysctl.d/99-concord-net.conf',
  'sudo sysctl --quiet --system >/dev/null',
  'concord/dc up -d --remove-orphans',
  'concord/dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force',
  'concord/dc ps --format "table {{.Service}}\\t{{.Status}}"',
].join(' && ')]);
console.log('applied; if livekit.yml or Revolt.toml changed, restart that service with concord/dc restart <service>');
