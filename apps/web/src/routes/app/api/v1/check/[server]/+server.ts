/**
 * A harmless, permission-gated endpoint: 200 only for a caller holding Manage server in the server, so live checks
 * can show a Stoat permission being enforced (m4.4-plan.md task 2). It costs Stoat calls, so it counts as a write.
 */
import { Permission } from '@concord/domain';
import { endpoint } from '$lib/server/layer/http.ts';
import { requireId } from '$lib/server/layer/input.ts';

export const GET = endpoint('write', async ({ event, layer, caller }) => {
  const server = requireId(event.params.server, 'server');
  await layer.requirePermission(caller, server, Permission.ManageServer, 'ManageServer');
  return { server, permission: 'ManageServer' };
});
