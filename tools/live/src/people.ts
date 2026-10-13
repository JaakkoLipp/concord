/**
 * API-side personas for the M2b live checks: the seeded ones and the extra accounts `tuuli` and `onni`
 * (made with `pnpm seed account`), each with a REST session and, when asked, a socket that keeps it online.
 */
import { loadState } from '../../seed/src/config.ts';
import { api, type Auth } from '../../seed/src/http.ts';
import { login, passwordFor } from '../../seed/src/seed.ts';

const st = loadState()!;

export interface Person {
  handle: string;
  id: string;
  /** `name#1234`, as friend requests take it. */
  tag: string;
  auth: Auth;
  token: string;
  call<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
}

export async function person(handle: string): Promise<Person> {
  const email = st.personas[handle]?.email ?? `${handle}@${st.emailDomain}`;
  const s = await login(email, passwordFor(handle));
  const auth = { session: s.token };
  const me = await api<{ _id: string; username: string; discriminator: string }>('GET', '/users/@me', { auth });
  return {
    handle, id: me._id, tag: `${me.username}#${me.discriminator}`, auth, token: s.token,
    call: (method, path, body) => api(method, path, { auth, ...(body !== undefined ? { body } : {}) }),
  };
}

/** A socket that keeps the person online until closed. */
export async function online(p: Person): Promise<{ close(): void }> {
  const ws = new WebSocket(`${st.backend.replace(/^http/, 'ws')}/ws?version=1&format=json`);
  await new Promise<void>((resolve) => {
    ws.onopen = () => ws.send(JSON.stringify({ type: 'Authenticate', token: p.token }));
    ws.onmessage = (m) => { if (JSON.parse(String(m.data)).type === 'Ready') resolve(); };
  });
  const ping = setInterval(() => ws.send(JSON.stringify({ type: 'Ping', data: 0 })), 15_000);
  return { close: () => { clearInterval(ping); ws.close(); } };
}

/** Undo any friendship, request or block between two people, from both sides. */
export async function unrelate(a: Person, b: Person): Promise<void> {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    await x.call('DELETE', `/users/${y.id}/block`).catch(() => {});
    await x.call('DELETE', `/users/${y.id}/friend`).catch(() => {});
  }
}

/** Wait until a check passes, returning the milliseconds it took on a monotonic clock. */
export async function until(check: () => Promise<boolean>, timeout = 8_000): Promise<number> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (await check().catch(() => false)) return Math.round(performance.now() - start);
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out');
}
