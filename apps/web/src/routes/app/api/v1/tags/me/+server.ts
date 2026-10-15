/**
 * Which tag the caller wears (m4.5-plan.md task 10): `{ server }` for that server's tag, which needs the caller to
 * be a member there, or `{ server: null }` for none.
 */
import { body, endpoint } from '$lib/server/layer/http.ts';
import { requireId } from '$lib/server/layer/input.ts';
import { serverTags, wear, type ServerTag } from '$lib/server/layer/tags.ts';
import { LayerError } from '$lib/server/layer/util.ts';

export const PUT = endpoint('write', async ({ event, layer, caller }): Promise<{ tag: ServerTag | null }> => {
  const input = await body(event);
  if (input.server === null) {
    wear(layer.store, caller.id, null);
    return { tag: null };
  }
  const server = requireId(input.server, 'server');
  const tag = serverTags(layer.store, [server])[server];
  if (!tag) throw new LayerError(404, 'NoTag');
  if (!(await layer.stoat.member(caller.token, server, caller.id))) throw new LayerError(403, 'NotMember');
  wear(layer.store, caller.id, server);
  return { tag };
});
