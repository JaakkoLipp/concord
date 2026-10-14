import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { onStack } from '../../target.ts';
import { SSH_TARGET } from './config.ts';

const run = promisify(execFile);

/** Run a command on the stack's machine: over one multiplexed SSH connection, or here for the local stack. */
export async function ssh(command: string, timeoutMs = 600_000): Promise<string> {
  if (SSH_TARGET === 'local') {
    const [cmd, args] = onStack(command);
    return (await run(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })).stdout;
  }
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ControlMaster=auto',
    '-o', `ControlPath=${join(tmpdir(), 'concord-ssh-%C')}`,
    '-o', 'ControlPersist=120',
    SSH_TARGET,
    command,
  ];
  const { stdout } = await run('ssh', args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** Quote one argument for the remote shell. */
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
