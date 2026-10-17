/** Where the app reopens: the channel last visited, as `/app` and a reloaded settings URL use it (client.md section 5). */
import { resolve } from '$app/paths';
import { recalled } from './channels.ts';

/** The last visited channel, or a server's last or given channel, or the friends screen. */
export function lastPlace(): string {
  const [server, channel] = recalled('last')?.split('/') ?? [];
  if (server && channel && server !== '@me') return resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel });
  if (channel) return resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel });
  return resolve('/app/channels/@me');
}
