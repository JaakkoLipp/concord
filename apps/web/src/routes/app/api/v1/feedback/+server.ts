import { body, endpoint } from '$lib/server/layer/http.ts';
import { listFeedback, submitFeedback } from '$lib/server/layer/feedback.ts';

export const POST = endpoint('write', async ({ event, layer, caller }) => submitFeedback(layer, caller, await body(event)));
export const GET = endpoint('read', ({ event, layer, caller }) => ({ feedback: listFeedback(layer, caller, event.url.searchParams.get('closed') === 'true') }));
