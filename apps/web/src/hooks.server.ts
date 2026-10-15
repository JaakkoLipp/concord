/**
 * The server's start: Concord's own layer (architecture section 11) opens its store, migrating it, and refuses to
 * start against a newer one. Settings come from the container's environment at run time, never from the build.
 * A layer that can't start answers 503 and /health says so, but the client is still served: the layer must
 * never take chat down.
 */
import { building, dev } from '$app/environment';
import { setLayer } from '$lib/server/layer/http.ts';
import { Layer, configFrom } from '$lib/server/layer/layer.ts';
import { MIGRATIONS } from '$lib/server/layer/migrations.ts';
import { openStore } from '$lib/server/layer/store.ts';

export const init = async () => {
  if (building) return;
  const env = process.env;
  try {
    // In development the dev server is on this machine, so it reaches the local stack through Caddy.
    const config = configFrom(env, { stoatApi: dev ? 'http://localhost/api' : 'http://api:14702' });
    const store = openStore(env.LAYER_DB || (dev ? '.data/layer.db' : '/srv/data/layer.db'), MIGRATIONS, console.log);
    process.once('sveltekit:shutdown', () => store.close());
    setLayer(new Layer(config, store));
    console.log(`layer: started, ${config.adminIds.size} admin IDs`);
  } catch (e) {
    console.error(`layer: NOT STARTED: ${e instanceof Error ? e.message : String(e)}`);
  }
};
