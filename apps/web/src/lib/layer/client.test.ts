import { describe, expect, it } from 'vitest';
import { BackendError } from '@concord/domain/errors';
import { HttpLayer } from './client.ts';

function layerAnswering(res: () => Response) {
  const seen: { url: string; token: string | null }[] = [];
  let signedOut = 0;
  const layer = new HttpLayer(() => 'tok', () => signedOut++, async (input, init) => {
    seen.push({ url: String(input), token: new Headers(init?.headers).get('x-session-token') });
    return res();
  });
  return { layer, seen, signedOut: () => signedOut };
}

describe('the layer client', () => {
  it('sends the token in a header and reads the answer', async () => {
    const t = layerAnswering(() => Response.json({ id: 'u', gates: { admin: false, serverCreator: true } }));
    expect((await t.layer.me()).gates.serverCreator).toBe(true);
    expect(t.seen).toEqual([{ url: '/app/api/v1/me', token: 'tok' }]);
  });

  it('signs out on the layer’s own 401', async () => {
    const t = layerAnswering(() => Response.json({ type: 'InvalidSession' }, { status: 401 }));
    await expect(t.layer.me()).rejects.toBeInstanceOf(BackendError);
    expect(t.signedOut()).toBe(1);
  });

  it.each([
    ['Stoat failing', () => Response.json({ type: 'StoatUnavailable' }, { status: 503 })],
    ['a limit', () => Response.json({ type: 'RateLimited', retry_after: 1000 }, { status: 429 })],
    ['a 401 that isn’t the layer’s', () => new Response('<html>401</html>', { status: 401 })],
  ])('keeps the session on %s', async (_, res) => {
    const t = layerAnswering(res);
    await expect(t.layer.me()).rejects.toBeInstanceOf(BackendError);
    expect(t.signedOut()).toBe(0);
  });
});
