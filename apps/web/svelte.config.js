import adapter from '@sveltejs/adapter-node';

// The stack this build runs on, for its CSP: the local stack unless CONCORD_HOST names another (tools/target.ts).
const host = process.env.CONCORD_HOST ?? 'localhost';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ out: 'build', precompress: true }),
    // Caddy routes only /app and /app/* to us until M6, so SvelteKit's own assets live under /app too.
    appDir: 'app/_app',
    // SvelteKit hashes its inline bootstrap script into the policy (client.md section 13).
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:'],
        'media-src': ['self', 'blob:'],
        'font-src': ['self', 'data:'],
        'connect-src': ['self', `wss://${host}`],
        'frame-ancestors': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'object-src': ['none'],
      },
    },
  },
};
