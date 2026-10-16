/**
 * The local LiveKit's admin API, for the probes that need to know what a participant may do server-side.
 * Reads the dev stack's key from `~/stoat/concord/livekit.env`; never used against production
 * (the callers run `assertDevStack`), and nothing from the file is printed.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BACKEND } from '../../seed/src/config.ts';

function key(): { id: string; secret: string } {
  const env = readFileSync(join(homedir(), 'stoat/concord/livekit.env'), 'utf8');
  const keys = /^LIVEKIT_KEYS=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '') ?? '';
  const [id, secret] = keys.split(':').map((x) => x.trim());
  if (!id || !secret) throw new Error('no LIVEKIT_KEYS in livekit.env');
  return { id, secret };
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function adminToken(room: string): string {
  const { id, secret } = key();
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: id, nbf: now - 10, exp: now + 60, video: { roomAdmin: true, room } })}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}

async function twirp<T>(method: string, room: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}/livekit/twirp/livekit.RoomService/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken(room)}` }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${res.status} ${await res.text()}`);
  return await res.json() as T;
}

export interface LiveParticipant { identity: string; state: string; permission?: { can_publish?: boolean; can_subscribe?: boolean; can_publish_sources?: string[] }; tracks?: { source: string; muted?: boolean }[] }

/** Who is in a room (a Stoat channel ID), with their server-side permissions and tracks. */
export async function participants(room: string): Promise<LiveParticipant[]> {
  return (await twirp<{ participants?: LiveParticipant[] }>('ListParticipants', room, { room })).participants ?? [];
}

/** A short line per participant: `identity canPublish/canSubscribe [sources] tracks`. */
export async function describe(room: string, names: Record<string, string>): Promise<string> {
  const list = await participants(room);
  if (!list.length) return '(empty)';
  return list.map((p) => `${names[p.identity] ?? p.identity}: publish=${p.permission?.can_publish ?? false} subscribe=${p.permission?.can_subscribe ?? false} sources=[${(p.permission?.can_publish_sources ?? []).join(',')}] tracks=[${(p.tracks ?? []).map((t) => t.source + (t.muted ? '(muted)' : '')).join(',')}]`).join('; ');
}
