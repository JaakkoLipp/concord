import { body, endpoint } from '$lib/server/layer/http.ts';
import { invitationLink, reviewInvitation } from '$lib/server/layer/beta.ts';
import { LayerError } from '$lib/server/layer/util.ts';
export const POST = endpoint('write', async ({ event, layer, caller }) => {
  const { action } = await body(event);
  const id = event.params.id ?? '';
  if (action === 'link') return { token: invitationLink(layer, caller, id) };
  if (action !== 'approve' && action !== 'decline') throw new LayerError(400, 'InvalidBody');
  reviewInvitation(layer, caller, id, action === 'approve');
  return { ok: true };
});

