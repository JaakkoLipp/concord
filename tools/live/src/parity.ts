/** M4.6's measured acceptance check, local personas only. Grows with the implementation tasks. */
import { chromium, type Locator } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';

await assertDevStack();
const st = loadState()!;
const failures: string[] = [];
function check(ok: boolean, name: string) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
interface Tip { id: string; text: string; opacity: number; side: string | undefined; x: number; y: number; width: number; height: number }
interface Frame { at: number; tips: Tip[] }
interface Sampling { frames: Frame[]; entered: number; until: number }
type SampleWindow = Window & { __parity: Sampling };
async function sample(target: Locator) {
  await target.evaluate((node) => {
    const w = window as unknown as SampleWindow;
    w.__parity = { frames: [], entered: Infinity, until: performance.now() + 400 };
    const sampling = w.__parity;
    node.addEventListener('pointerenter', () => { w.__parity.entered = performance.now(); }, { once: true });
    const frame = (at: number) => {
      if (w.__parity !== sampling) return;
      w.__parity.frames.push({ at, tips: [...document.querySelectorAll<HTMLElement>('.concord-tooltip')].map((tip) => {
        const r = tip.getBoundingClientRect();
        return { id: tip.id, text: tip.textContent ?? '', opacity: Number(getComputedStyle(tip).opacity), side: tip.dataset.side, x: r.x, y: r.y, width: r.width, height: r.height };
      }) });
      if (at < w.__parity.until) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await target.hover();
  await page.waitForTimeout(170);
  return page.evaluate(() => (window as unknown as SampleWindow).__parity);
}
async function tooltip(target: Locator, side: string, text: string) {
  const { frames, entered } = await sample(target);
  const after = frames.filter((frame) => frame.at >= entered);
  const first = after[0];
  check(!!first?.tips.some((tip) => tip.text.includes(text)), `${text}: tooltip exists on the first hover frame`);
  const full = after.find((frame) => frame.tips.some((tip) => tip.text.includes(text) && tip.opacity >= 0.99));
  check(!!full && full.at - entered <= 133, `${text}: fully visible within 100 ms plus one frame (${full ? Math.round(full.at - entered) : 'missing'} ms)`);
  const tip = full?.tips.find((tip) => tip.text.includes(text));
  const r = await target.boundingBox();
  const correct = tip && r && tip.side === side && (side === 'top' ? tip.y + tip.height <= r.y : side === 'right' ? tip.x >= r.x + r.width : tip.y >= r.y + r.height);
  check(!!correct, `${text}: tooltip is on the ${side}`);
  const timing = await page.locator('.concord-tooltip[data-open="true"]').evaluate((tip) => ({ duration: getComputedStyle(tip).transitionDuration, scale: getComputedStyle(tip).scale }));
  check(timing.duration === '0.1s' && timing.scale === 'none', `${text}: 100 ms opacity fade without growth`);
}
try {
  await signIn(page, 'dev');
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}`, { waitUntil: 'networkidle' });
  await page.locator('.composer').waitFor();
  await page.mouse.move(900, 10); await page.waitForTimeout(150);
  await tooltip(page.getByRole('button', { name: 'User settings', exact: true }), 'top', 'User settings');
  const rail = page.locator('.rail a.item').nth(1);
  const name = await rail.evaluate((el) => el.getAttribute('aria-label')?.split(',')[0] ?? '');
  await tooltip(rail, 'right', name);
  await page.mouse.move(900, 10); await page.waitForTimeout(150);
  const pin = page.getByRole('button', { name: /pinned/i }).first();
  await pin.click();
  const close = page.locator('.find header .icon-button');
  await tooltip(close, 'bottom', await close.getAttribute('aria-label') ?? '');
  const neighbour = page.getByRole('button', { name: /member list/i }).first();
  await neighbour.hover(); await page.waitForTimeout(150);
  const oldId = await page.locator('.concord-tooltip[data-open="true"]').getAttribute('id');
  const cross = await sample(pin);
  check(cross.frames.some((frame) => frame.at >= cross.entered && frame.tips.some((tip) => tip.id === oldId) && frame.tips.some((tip) => tip.id !== oldId)), 'neighbouring tooltips coexist during the crossfade');
  const described = await pin.getAttribute('aria-describedby');
  await pin.evaluate((node) => node.remove());
  await page.waitForTimeout(30);
  check(!described || await page.locator(`[id="${described}"]`).count() === 0, 'removing a target removes its tooltip during a fade');
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.olohuone}`, { waitUntil: 'networkidle' });
  const showChat = page.getByRole('button', { name: 'Show chat', exact: true });
  if (await showChat.count()) await showChat.click();
  const chatClose = page.locator('.chat header .icon-button');
  await tooltip(chatClose, 'bottom', 'Hide chat');
  await chatClose.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'User settings', exact: true }).hover();
  const reduced = page.locator('.concord-tooltip[data-open="true"]');
  check(await reduced.evaluate((tip) => getComputedStyle(tip).opacity === '1' && getComputedStyle(tip).transitionDuration === '0s' && !tip.getAnimations().length), 'reduced motion: tooltip appears without animation');
} finally { await browser.close(); }
console.log(failures.length ? `parity: ${failures.length} failed` : 'parity: all passed');
process.exit(failures.length ? 1 : 0);
