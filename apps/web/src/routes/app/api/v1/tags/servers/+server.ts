/** Servers' tags, by `?ids=` (m4.5-plan.md task 10): for the settings and for choosing one to wear. */
import { endpoint } from '$lib/server/layer/http.ts';
import { requireIds } from '$lib/server/layer/input.ts';
import { serverTags } from '$lib/server/layer/tags.ts';

export const GET = endpoint('read', ({ event, layer }) => {
  const ids = requireIds((event.url.searchParams.get('ids') ?? '').split(',').filter(Boolean), 200, 'ids');
  return { servers: serverTags(layer.store, ids) };
});
