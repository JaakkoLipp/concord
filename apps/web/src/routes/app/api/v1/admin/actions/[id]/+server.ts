import { endpoint } from '$lib/server/layer/http.ts';
import { accountActionResult } from '$lib/server/layer/accounts.ts';
export const GET = endpoint('read', ({ event, layer, caller }) => accountActionResult(layer, caller, event.params.id ?? ''));
