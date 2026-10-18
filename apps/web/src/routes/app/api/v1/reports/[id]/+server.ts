import { body, endpoint } from '$lib/server/layer/http.ts';
import { closeReport } from '$lib/server/layer/reports.ts';

export const POST = endpoint('write', async ({ event, layer, caller }) => {
  const { note } = await body(event);
  await closeReport(layer, caller, event.params.id ?? '', note);
  return { ok: true };
});
