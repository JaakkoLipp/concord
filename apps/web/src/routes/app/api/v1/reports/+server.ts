import { body, endpoint } from '$lib/server/layer/http.ts';
import { fileReport, listReports, scopeOf } from '$lib/server/layer/reports.ts';

export const GET = endpoint('read', async ({ event, layer, caller }) => ({ reports: await listReports(layer, caller, scopeOf(event.url), event.url.searchParams.get('closed') === 'true') }));
export const POST = endpoint('write', async ({ event, layer, caller }) => fileReport(layer, caller, await body(event)));
