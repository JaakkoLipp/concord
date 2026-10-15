/**
 * The tags people wear, in bulk, so a member list costs one request (m4.5-plan.md task 10). Open to anyone signed
 * in. Clients show a tag only for people in that server's member list as they know it.
 */
import { body, endpoint } from '$lib/server/layer/http.ts';
import { requireIds } from '$lib/server/layer/input.ts';
import { wornTags } from '$lib/server/layer/tags.ts';

export const POST = endpoint('read', async ({ event, layer }) => {
  const users = requireIds((await body(event)).users, 1_000, 'users');
  return { users: wornTags(layer.store, users) };
});
