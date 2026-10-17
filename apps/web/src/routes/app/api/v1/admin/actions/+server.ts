import { body, endpoint } from '$lib/server/layer/http.ts';
import { requestAccountAction } from '$lib/server/layer/accounts.ts';
export const POST = endpoint('write', async ({ event, layer, caller }) => {
  const input = await body(event);
  return requestAccountAction(layer, caller, input.action, input.user);
});
