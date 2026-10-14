/**
 * Throwaway servers for the M2c live checks (m2c-plan.md). Each check names its servers with the prefix
 * `m2c-check` and calls `sweep` at both ends, so a failed run leaves nothing behind.
 */
import { loadState } from '../../seed/src/config.ts';
import type { Person } from './people.ts';

const st = loadState()!;
export const PREFIX = 'm2c-check';

/** The servers a person is in, from a fresh socket's Ready: Stoat has no REST list of them. */
export async function serversOf(p: Person): Promise<{ _id: string; name: string; owner: string }[]> {
  const ws = new WebSocket(`${st.backend.replace(/^http/, 'ws')}/ws?version=1&format=json`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('no Ready')); }, 15_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'Authenticate', token: p.token }));
    ws.onmessage = (m) => {
      const f = JSON.parse(String(m.data)) as { type: string; servers?: { _id: string; name: string; owner: string }[] };
      if (f.type !== 'Ready') return;
      clearTimeout(timer);
      ws.close();
      resolve(f.servers ?? []);
    };
  });
}

/** Delete every check server the owner still has, and take the others out of any they joined. */
export async function sweep(owner: Person, others: Person[] = []): Promise<number> {
  let n = 0;
  for (const s of await serversOf(owner)) {
    if (s.owner !== owner.id || !s.name.startsWith(PREFIX)) continue;
    await owner.call('DELETE', `/servers/${s._id}`).catch(() => {});
    n++;
  }
  for (const p of others) {
    for (const s of await serversOf(p)) if (s.name.startsWith(PREFIX)) await p.call('DELETE', `/servers/${s._id}?leave_silently=true`).catch(() => {});
  }
  return n;
}

/** A fresh check server with an invite to its one channel. */
export async function checkServer(owner: Person, label: string): Promise<{ id: string; general: string; invite: string; name: string }> {
  const name = `${PREFIX} ${label}`.slice(0, 32);
  const r = await owner.call<{ server: { _id: string }; channels: { _id: string }[] }>('POST', '/servers/create', { name });
  const general = r.channels[0]!._id;
  const invite = await owner.call<{ _id: string }>('POST', `/channels/${general}/invites`);
  return { id: r.server._id, general, invite: invite._id, name };
}
