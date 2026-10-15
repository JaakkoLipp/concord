/**
 * M4.2's motion check (m4.2-plan.md task 7), on the local stack: `node tools/live/src/motion.ts [out-dir]`.
 * Opens each animated surface as `dev`, with reduced motion off and then on, and records every animation that
 * runs: CSS transitions and animations, and Svelte's, which use the Web Animations API. It checks that:
 * - only transform, opacity and colours animate, and with reduced motion only opacity and colours,
 * - a closing surface keeps its content while it fades,
 * - a menu opened from the keyboard doesn't move,
 * - no frame stalls longer than 50 ms. Headless has no GPU, so frame times are a lower bound.
 */
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';
import { fakeMediaArgs } from './media.ts';

await assertDevStack();
const out = process.argv[2];
const st = loadState()!;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

const MOVES = ['transform', 'translate', 'scale', 'rotate'];
const FADES = ['opacity', 'color', 'background', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke', 'clip-path'];

interface Seen { what: string; props: string[] }

/** Watches every animation each frame, and the longest gap between frames. */
function recorder() {
  const w = window as unknown as { __seen: Seen[]; __gap: number; __long: string[]; __t0: number; __animations: WeakSet<Animation> };
  w.__seen = []; w.__gap = 0; w.__long = []; w.__t0 = 0; w.__animations = new WeakSet();
  let last = 0;
  const frame = (t: number) => {
    // Only frames that start inside the step: one already under way belongs to the step before.
    if (last && last >= w.__t0 && document.visibilityState === 'visible') {
      w.__gap = Math.max(w.__gap, t - last);
      if (t - last > 50) w.__long.push(`${Math.round(last - w.__t0)} ms in, ${Math.round(t - last)} ms`);
    }
    last = t;
    for (const a of document.getAnimations()) {
      if (w.__animations.has(a)) continue;
      w.__animations.add(a);
      const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const what = `${a.constructor.name} on ${target?.tagName.toLowerCase()}.${[...(target?.classList ?? [])].filter((c) => !c.startsWith('s-')).join('.')}`;
      let props: string[] = [];
      if (a instanceof CSSTransition) props = [a.transitionProperty];
      else {
        // A property counts only if its value changes: under reduced motion a scale stays at 1 throughout.
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        const style = target ? getComputedStyle(target) : null;
        const keys = new Set(frames.flatMap((f) => Object.keys(f)));
        for (const k of keys) {
          if (['offset', 'computedOffset', 'easing', 'composite', 'pointerEvents'].includes(k)) continue;
          const css = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
          // A keyframe without the property uses the element's own value. A CSS animation's keyframes come back as
          // written, with var() unresolved, so a probe on the page resolves them.
          const resolve = (v: string) => {
            if (!/var\(|calc\(/.test(v)) return v;
            const probe = document.createElement('div');
            probe.style.setProperty(css, v);
            document.body.append(probe);
            const r = getComputedStyle(probe).getPropertyValue(css);
            probe.remove();
            return r;
          };
          const values = new Set(frames.map((f) => resolve(String(f[k] ?? style?.getPropertyValue(css)))));
          // A from-only animation ends at the element's own value: identity for a movement, 1 for opacity.
          const moves = ['transform', 'translate', 'scale', 'rotate'].includes(css);
          if (!frames.some((f) => f.computedOffset === 1 && k in f)) values.add(moves ? 'none' : css === 'opacity' ? '1' : 'own value');
          // A movement's identity in any spelling: none, a scale of 1, a translation or rotation of 0.
          const n = (v: string) => moves && (v === 'none' || v.split(/\s+/).every((x) => Number(x) === 1 || /^0(px|deg)?$/.test(x))) ? 'identity' : v;
          if (new Set([...values].map(n)).size > 1) props.push(css);
        }
      }
      w.__seen.push({ what, props });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

type Recorded = { __seen: Seen[]; __gap: number; __long: string[]; __t0: number };
const reset = (p: Page) => p.evaluate(() => { const w = window as unknown as Recorded; w.__seen = []; w.__gap = 0; w.__long = []; w.__t0 = performance.now(); });
const take = (p: Page) => p.evaluate(() => { const w = window as unknown as Recorded; return { seen: w.__seen, gap: w.__gap, long: w.__long }; });

async function session(browser: Browser, reducedMotion: 'no-preference' | 'reduce') {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion, permissions: ['microphone'] });
  await context.addInitScript(recorder);
  const page = await context.newPage();
  await signIn(page, 'dev');
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor();
  await page.waitForTimeout(500);
  return page;
}

/** Runs a step and checks what animated during it. */
async function step(p: Page, mode: string, name: string, act: () => Promise<void>, expect: { moves?: boolean; some?: boolean } = {}) {
  await reset(p);
  await act();
  await p.waitForTimeout(400);
  const { seen, gap, long } = await take(p);
  const props = [...new Set(seen.flatMap((s) => s.props))];
  const allowed = expect.moves === false || mode === 'reduce' ? FADES : [...MOVES, ...FADES];
  const bad = seen.filter((s) => s.props.some((x) => !allowed.includes(x)));
  check(!bad.length, `${mode}: ${name} animates ${props.join(', ') || 'nothing'}${bad.length ? ` (not allowed: ${JSON.stringify(bad)})` : ''}`);
  if (expect.some !== undefined) check(expect.some === seen.length > 0, `${mode}: ${name} ${expect.some ? 'animates' : "doesn't animate"}`);
  // Frames count where something animates: a page change that doesn't animate isn't an animation's dropped frame.
  if (seen.length) check(gap < 50, `${mode}: ${name} longest frame ${gap.toFixed(0)} ms${long.length ? ` (${long.join('; ')})` : ''}`);
  return seen;
}

// Joins calls as seeded personas: the local stack only, as assertDevStack checked.
const browser = await chromium.launch({ headless: true, args: [...fakeMediaArgs(), '--autoplay-policy=no-user-gesture-required'] });

// MOTION_MODES=reduce runs one pass only.
const modes = (process.env.MOTION_MODES?.split(',') ?? ['no-preference', 'reduce']) as ('no-preference' | 'reduce')[];
for (const mode of modes) {
  const p = await session(browser, mode);
  const header = p.getByRole('button', { name: /menu$/ }).first();
  const menu = p.getByRole('menu');

  await step(p, mode, 'server menu opens', () => header.click(), { some: true });
  const origin = await menu.evaluate((e) => getComputedStyle(e).transformOrigin);
  console.log(`     server menu grows from ${origin}`);
  if (out && mode === 'no-preference') await p.screenshot({ path: `${out}/menu-open.png`, clip: { x: 0, y: 0, width: 600, height: 500 } });
  const items = await menu.innerText();
  await step(p, mode, 'server menu closes', async () => {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(30);
    const leaving = await p.locator('.menu').count() ? await p.locator('.menu').innerText() : '';
    check(mode === 'reduce' || leaving === items, `${mode}: the closing menu keeps its items (${JSON.stringify(leaving.slice(0, 40))})`);
  }, { some: true });

  // From the keyboard: focus the header and press Enter.
  await header.focus();
  await p.keyboard.press('Shift+Tab');
  await p.keyboard.press('Tab');
  await step(p, mode, 'server menu opened from the keyboard', () => p.keyboard.press('Enter'), { some: false });
  await step(p, mode, 'server menu closed from the keyboard', () => p.keyboard.press('Escape'), { some: false });

  // Authors' names have a context menu. Messages get theirs in M4.5.
  const author = p.locator('article.message button.name').last();
  await step(p, mode, 'context menu opens', () => author.click({ button: 'right' }), { some: true });
  await step(p, mode, 'context menu closes', () => p.keyboard.press('Escape'), { some: true });

  const member = p.getByRole('button', { name: /^Open .*profile/ }).first();
  await step(p, mode, 'profile popout opens', () => member.click(), { some: true });
  if (out && mode === 'no-preference') await p.screenshot({ path: `${out}/popout.png` });
  await step(p, mode, 'profile popout closes', () => p.keyboard.press('Escape'), { some: true });

  // The picker's first open in a session decodes its images, about 500 ms headless, in native code. Later opens are what's checked.
  const emoji = p.locator('.composer').getByRole('button', { name: 'Choose an emoji' });
  await reset(p);
  await emoji.click();
  await p.waitForTimeout(800);
  console.log(`     emoji picker's first open: longest frame ${(await take(p)).gap.toFixed(0)} ms`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await step(p, mode, 'emoji picker opens', () => emoji.click(), { some: true });
  await step(p, mode, 'emoji picker closes', () => p.keyboard.press('Escape'), { some: true });

  const pin = p.getByRole('button', { name: /pinned/i }).first();
  await step(p, mode, 'tooltip shows', async () => { await pin.hover(); await p.waitForTimeout(600); }, { some: true });
  await step(p, mode, 'tooltip moves to a neighbour without motion', async () => {
    await p.getByRole('button', { name: /member list/i }).first().hover();
    await p.waitForTimeout(100);
  });
  check(await p.locator('.concord-tooltip').evaluate((e) => getComputedStyle(e).opacity === '1'), `${mode}: the neighbour's tooltip shows at once`);
  await p.mouse.move(800, 400);

  // Dialogs: the custom status dialog, from the dock's menu, closed with Escape.
  await p.locator('section.dock button.me').click();
  await p.waitForTimeout(300);
  await step(p, mode, 'dialog opens', () => p.getByRole('button', { name: /custom status/i }).click(), { some: true });
  const title = await p.locator('dialog[open] h2').innerText();
  await step(p, mode, 'dialog closes', async () => {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(30);
    const leaving = await p.locator('dialog[open] h2').count() ? await p.locator('dialog[open] h2').innerText() : '';
    check(leaving === title, `${mode}: the closing dialog keeps its content (${JSON.stringify(leaving)})`);
  }, { some: true });
  check(await p.locator('dialog[open]').count() === 0, `${mode}: the dialog has closed`);

  // The image viewer, from #kuvat-ja-videot.
  await p.goto(`${APP}/channels/${st.serverId}/${st.channels.kuvat}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const image = p.getByRole('button', { name: /^View image/ }).last();
  if (await image.count()) {
    await step(p, mode, 'image viewer opens', () => image.click(), { some: true });
    await step(p, mode, 'image viewer closes', () => p.keyboard.press('Escape'), { some: true });
    check(await p.locator('dialog.viewer[open]').count() === 0, `${mode}: the image viewer has closed`);
    // A click beside the image, inside the dialog's padding box, closes it too.
    await image.click();
    await p.waitForTimeout(400);
    await p.mouse.click(80, 450);
    await p.waitForTimeout(400);
    check(await p.locator('dialog.viewer[open]').count() === 0, `${mode}: a click beside the image closes the viewer`);
  } else check(false, `${mode}: no image to open in the viewer`);

  // Settings fades in as a page, a change of section doesn't replay it, and closing is instant.
  const page = (seen: Seen[]) => seen.filter((x) => x.what.includes('.settings')).length;
  const opened = await step(p, mode, 'settings opens', () => p.getByRole('button', { name: 'User settings' }).click(), { some: true });
  check(page(opened) === 1, `${mode}: settings fades in`);
  const moved = await step(p, mode, 'settings changes section', () => p.getByRole('link', { name: 'Notifications' }).click());
  check(page(moved) === 0, `${mode}: a change of section doesn't fade the page`);
  await step(p, mode, 'settings closes', () => p.keyboard.press('Escape'), { some: false });

  // Voice: the panel, someone joining and leaving, grid and focus, and leaving.
  await p.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const panel = (seen: Seen[]) => seen.filter((x) => x.what.includes('.panel')).length;
  const tile = (seen: Seen[]) => seen.filter((x) => x.what.includes('.tile') && !x.what.startsWith('CSSTransition')).length;
  const joined = await step(p, mode, 'joining a call', async () => {
    await p.getByRole('link', { name: /^Pelaamo/ }).click();
    await p.getByText('Voice connected').waitFor({ timeout: 20_000 });
  }, { some: true });
  check(panel(joined) > 0, `${mode}: the voice panel fades in`);
  check(tile(joined) === 0, `${mode}: the call view's first tiles don't animate`);
  // Tiles arriving in the call view's first second are people already there, which don't fade in.
  const aino = await (await browser.newContext({ permissions: ['microphone'] })).newPage();
  await signIn(aino, 'aino');
  await aino.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1_500);
  const added = await step(p, mode, 'someone joins', async () => {
    await aino.getByRole('link', { name: /^Pelaamo/ }).click();
    await aino.getByText('Voice connected').waitFor({ timeout: 20_000 });
    await p.locator('.call .tile').nth(1).waitFor();
  });
  check(tile(added) > 0, `${mode}: a joining tile fades in`);
  const focused = await step(p, mode, 'focusing a tile', () => p.locator('.grid .tile').first().click());
  check(tile(focused) === 0, `${mode}: switching to focus doesn't animate the tiles`);
  await p.locator('.main-tile .tile').click();
  await p.waitForTimeout(300);
  const removed = await step(p, mode, 'someone leaves', async () => {
    await aino.getByRole('button', { name: 'Disconnect' }).first().click();
    await p.waitForFunction(() => document.querySelectorAll('.call .tile').length === 1, null, { timeout: 15_000 });
  });
  check(tile(removed) > 0, `${mode}: a leaving tile fades out`);
  const left = await step(p, mode, 'leaving the call', () => p.getByRole('button', { name: 'Disconnect' }).first().click(), { some: true });
  check(panel(left) > 0, `${mode}: the voice panel fades out`);
  await aino.context().close();
  await p.context().close();
}
await browser.close();
console.log(failures.length ? `motion: ${failures.length} failed` : 'motion: all passed');
process.exit(failures.length ? 1 : 0);
