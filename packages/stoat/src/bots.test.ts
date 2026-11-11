/** Bots (m4.3-plan.md review point N): a bot's token is a credential, so it leaves the adapter only when asked for. */
import { describe, expect, it } from 'vitest';
import { StoatBackend } from './backend.ts';
import type { HttpRequest, Transport } from './transport.ts';

const TOKEN = 'the-bot-token-that-must-not-leak';
const B = '01M4WPBMZWYQ9GB009CG8FDEZA';
const user = { _id: B, username: 'robo', discriminator: '0001', bot: { owner: 'o' }, relationship: 'None', online: false };
const bot = { _id: B, owner: 'o', public: false, token: TOKEN };

function backend() {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      const body = request.path === '/bots/@me' ? { bots: [bot], users: [user] } : request.path === `/bots/${B}` && request.method === 'GET' ? { bot, user } : { ...bot, user };
      return { status: 200, headers: {}, body };
    },
  } as unknown as Transport;
  return { api: new StoatBackend(transport), requests };
}

describe('bots', () => {
  it('keeps the token out of every list, create and edit result', async () => {
    const { api } = backend();
    const results = [await api.ownedBots(), await api.createBot('robo'), await api.editBot(B, { public: true })];
    expect(JSON.stringify(results)).not.toContain(TOKEN);
    expect(results[0]).toMatchObject({ bots: [{ id: B, owner: 'o', public: false }] });
  });

  it('gives the token only when asked, and resets it by removing it', async () => {
    const { api, requests } = backend();
    expect(await api.botToken(B)).toBe(TOKEN);
    expect(await api.resetBotToken(B)).toBe(TOKEN);
    expect(requests.at(-1)).toMatchObject({ method: 'PATCH', path: `/bots/${B}`, body: { remove: ['Token'] } });
  });
});
