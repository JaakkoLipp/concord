import { endpoint } from '$lib/server/layer/http.ts';
import { platformUsers } from '$lib/server/layer/accounts.ts';
export const GET = endpoint('read', ({ layer, caller }) => platformUsers(layer, caller));
