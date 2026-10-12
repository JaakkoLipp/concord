import { BACKEND, loadState } from './config.ts';
import { PERSONAS, TOTP } from './data.ts';
import { login, passwordFor } from './seed.ts';

/** Keep about 15 personas online by holding their WebSockets open, for screenshots and demos. */
export async function hold(count = 15): Promise<void> {
  const state = loadState();
  if (!state) throw new Error('no seed state; run pnpm seed first');
  const chosen = PERSONAS.filter((p) => p.handle !== TOTP).slice(0, count);
  const url = `${BACKEND.replace(/^http/, 'ws')}/ws?version=1&format=json`;
  const sockets: WebSocket[] = [];
  for (const p of chosen) {
    const email = state.personas[p.handle]!.email;
    const { token } = await login(email, passwordFor(p.handle));
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'Authenticate', token })));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { type: string };
      if (msg.type === 'Ready') console.log(`online: ${p.handle}`);
    });
    ws.addEventListener('close', () => console.log(`closed: ${p.handle}`));
    sockets.push(ws);
  }
  const ping = setInterval(() => {
    for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'Ping', data: Date.now() }));
  }, 20_000);
  console.log(`holding ${sockets.length} sockets; Ctrl+C to stop`);
  await new Promise<void>((resolve) => process.once('SIGINT', () => resolve()));
  clearInterval(ping);
  for (const ws of sockets) ws.close();
}
