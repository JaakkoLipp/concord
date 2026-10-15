/**
 * Enabling, changing and disabling a server's tag (m4.5-plan.md task 10). Only for someone Stoat lets create
 * servers who also holds Manage server there. The badge must be one of that server's own custom emoji.
 */
import { Permission } from '@concord/domain';
import { body, endpoint } from '$lib/server/layer/http.ts';
import { requireId } from '$lib/server/layer/input.ts';
import type { Caller, Layer } from '$lib/server/layer/layer.ts';
import { removeServerTag, requireTag, setServerTag } from '$lib/server/layer/tags.ts';
import { LayerError } from '$lib/server/layer/util.ts';

async function allowed(layer: Layer, caller: Caller, server: string): Promise<void> {
  await layer.requireServerCreator(caller);
  await layer.requirePermission(caller, server, Permission.ManageServer, 'ManageServer');
}

export const PUT = endpoint('write', async ({ event, layer, caller }) => {
  const server = requireId(event.params.server, 'server');
  const input = await body(event);
  const tag = requireTag(input.tag);
  const emoji = requireId(input.emoji, 'emoji');
  await allowed(layer, caller, server);
  if ((await layer.stoat.emojiServer(caller.token, emoji)) !== server) throw new LayerError(400, 'NotServerEmoji');
  console.log(`layer: tag ${server} set by user ${caller.id}`);
  return setServerTag(layer.store, { server, tag, emoji }, caller.id);
});

export const DELETE = endpoint('write', async ({ event, layer, caller }) => {
  const server = requireId(event.params.server, 'server');
  await allowed(layer, caller, server);
  removeServerTag(layer.store, server);
  console.log(`layer: tag ${server} disabled by user ${caller.id}`);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
});
