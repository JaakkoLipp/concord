import { endpoint } from '$lib/server/layer/http.ts';
import { closeFeedback } from '$lib/server/layer/feedback.ts';

export const POST = endpoint('write', ({ event, layer, caller }) => {
  closeFeedback(layer, caller, event.params.id ?? '');
  return { ok: true };
});
