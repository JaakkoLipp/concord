import { endpoint } from '$lib/server/layer/http.ts';
import { countReports, scopeOf } from '$lib/server/layer/reports.ts';

export const GET = endpoint('read', async ({ event, layer, caller }) => ({ count: await countReports(layer, caller, scopeOf(event.url)) }));
