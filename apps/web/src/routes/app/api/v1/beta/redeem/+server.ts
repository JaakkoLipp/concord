import { body, publicEndpoint } from '$lib/server/layer/http.ts';
import { redeemInvitation } from '$lib/server/layer/beta.ts';
import { addressKey } from '$lib/server/layer/layer.ts';
import { LayerError, RateLimiter } from '$lib/server/layer/util.ts';
const limits = new RateLimiter(10, 60_000, Date.now);
export const POST = publicEndpoint(async ({ event, layer }) => {
  const wait = limits.take(addressKey(event.getClientAddress()));
  if (wait) throw new LayerError(429, 'RateLimited', { retry_after: wait });
  const input = await body(event);
  await redeemInvitation(layer, input.token, input.email, input.password);
  return { ok: true };
});

