/**
 * Moderating a voice channel (m4.7-plan.md task 3): who this account may move, server mute or server deafen, and
 * the moves and flag edits themselves. The rules mirror Stoat's (m4.7-results.md, task 1): rank decides who may be
 * acted on, the permission is checked in the channel they are in, and a move needs Connect for the mover on the
 * destination, not for the one moved. Moving ignores the destination's user limit.
 */
import { BackendError, Permission, canActOnMember, has, memberKey, type Id, type Session } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { channelsWith, myRank } from '$lib/view/admin.ts';
import { permissionsIn } from '$lib/view/channels.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

export interface VoiceModeration {
  server: Id;
  channel: Id;
  canMute: boolean;
  canDeafen: boolean;
  /** Voice channels to move them to, in sidebar order: where this account may connect, bar the one they are in. */
  destinations: Id[];
}

/** What this account may do to someone in a server voice channel, or null when nothing (a DM call, yourself, anyone not below you). */
export function voiceModeration(session: Session, user: Id): VoiceModeration | null {
  const store = session.store;
  const self = store.selfId;
  const channel = store.channels.get(store.voiceChannelOf(user) ?? '');
  if (!self || user === self || !channel || channel.kind !== 'text' || !channel.voice) return null;
  const server = store.servers.get(channel.server);
  const member = store.members.get(memberKey(channel.server, user));
  if (!server || !member || !canActOnMember(server, self, myRank(store, server.id), user, member)) return null;
  const mine = permissionsIn(store, channel);
  const destinations = has(mine, Permission.MoveMembers)
    ? channelsWith(store, server.id, Permission.Connect).filter((id) => id !== channel.id && !!(store.channels.get(id) as { voice?: unknown } | undefined)?.voice)
    : [];
  const out: VoiceModeration = { server: server.id, channel: channel.id, canMute: has(mine, Permission.MuteMembers), canDeafen: has(mine, Permission.DeafenMembers), destinations };
  return out.canMute || out.canDeafen || destinations.length ? out : null;
}

const SETTLE_MS = 2_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Server mute or deafen: sets the member's flag. Stoat answers 500 when the moderator is in another call, though the flag
 * was stored (m4.7-results.md), so a 500 waits briefly for the member update that follows before it counts as a failure.
 */
export async function setServerFlag(session: Session, server: Id, user: Id, flag: 'canPublish' | 'canReceive', value: boolean): Promise<void> {
  const holds = () => session.store.members.get(memberKey(server, user))?.[flag] === value;
  try {
    await session.admin.editMember(server, user, { [flag]: value });
  } catch (e) {
    if (e instanceof BackendError && e.status === 500) {
      for (let waited = 0; waited < SETTLE_MS && !holds(); waited += 100) await sleep(100);
      if (holds()) return;
    }
    toasts.show(m.voiceMod.flagFailed(session.store.displayName(user, server)));
  }
}
