/** Whether the layer runs, its store opens and Stoat answers it. Open to anyone; it reveals nothing else. */
import { json } from '@sveltejs/kit';
import { publicEndpoint } from '$lib/server/layer/http.ts';

export const GET = publicEndpoint(async ({ layer }) => {
  layer.store.prepare('SELECT 1').get();
  const stoat = await layer.stoatUp();
  return json({ ok: stoat, stoat: stoat ? 'up' : 'down' }, { status: stoat ? 200 : 503, headers: { 'cache-control': 'no-store' } });
});
