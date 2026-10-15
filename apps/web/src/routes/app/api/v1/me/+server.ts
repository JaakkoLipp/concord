/** Who the caller is to the layer, and which of our own gates they pass. */
import { endpoint } from '$lib/server/layer/http.ts';

export const GET = endpoint('read', async ({ layer, caller }) => ({ id: caller.id, gates: await layer.gates(caller) }));
