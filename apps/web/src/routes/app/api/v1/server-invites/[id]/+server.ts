import { body, endpoint } from '$lib/server/layer/http.ts';
import { reviewServerInvite } from '$lib/server/layer/serverInvites.ts';
import { LayerError } from '$lib/server/layer/util.ts';
export const POST = endpoint('write', async ({ event, layer, caller }) => {
  const { action, code } = await body(event);
  if (action !== 'approve' && action !== 'decline') throw new LayerError(400, 'InvalidBody');
  await reviewServerInvite(layer, caller, event.params.id ?? '', action === 'approve', code);
  return { ok: true };
});
