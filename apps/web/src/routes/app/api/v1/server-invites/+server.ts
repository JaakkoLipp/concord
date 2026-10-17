import { body, endpoint } from '$lib/server/layer/http.ts';
import { listServerInvites, requestServerInvite } from '$lib/server/layer/serverInvites.ts';
export const GET = endpoint('read', ({ event, layer, caller }) => ({ invites: listServerInvites(layer, caller, event.url.searchParams.get('review') === 'true') }));
export const POST = endpoint('write', async ({ event, layer, caller }) => {
  const input = await body(event);
  return requestServerInvite(layer, caller, input.server, input.note ?? '', input.code);
});
