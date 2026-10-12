/**
 * Copy the Twemoji SVGs into apps/web/static/app/emoji/ so they are served from our origin at /app/emoji/.
 * They are build output, not committed. Run by `pnpm verify`, `pnpm deploy:web` and before `pnpm dev`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const WEB = join(ROOT, 'apps', 'web');
const src = join(dirname(createRequire(join(WEB, 'package.json')).resolve('@twemoji/svg/package.json')));
const out = join(WEB, 'static', 'app', 'emoji');
const files = readdirSync(src).filter((f) => f.endsWith('.svg'));
if (!existsSync(out) || readdirSync(out).length !== files.length) {
  mkdirSync(out, { recursive: true });
  for (const f of files) cpSync(join(src, f), join(out, f));
  console.log(`twemoji: copied ${files.length} SVGs`);
}
