/** The channel to return to when reopening a settings URL. */
import { resolve } from '$app/paths';
import { recalled } from './channels.ts';

/** The last visited channel, or a server's last or given channel, or the friends screen. */
export function lastPlace(): string {
  const [server, channel] = recalled('last')?.split('/') ?? [];
  if (server && channel && server !== '@me') return resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel });
  if (channel) return resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel });
  return resolve('/app/channels/@me');
}
