import { body, endpoint } from '$lib/server/layer/http.ts';
import { listInvitations, requestInvitation } from '$lib/server/layer/beta.ts';
export const GET = endpoint('read', ({ event, layer, caller }) => ({ invitations: listInvitations(layer, caller, event.url.searchParams.get('review') === 'true') }));
export const POST = endpoint('write', async ({ event, layer, caller }) => requestInvitation(layer, caller, (await body(event)).email));

