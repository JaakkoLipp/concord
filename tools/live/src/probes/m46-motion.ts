/** M4.6 task 0 browser probe. Run with `node tools/live/src/probes/m46-motion.ts`. */
import { chromium, firefox } from 'playwright-core';
import { loadState } from '../../../seed/src/config.ts';
import { assertDevStack } from '../../../seed/src/vps.ts';
import { APP } from '../browser.ts';
import { signIn } from '../login.ts';

await assertDevStack();
const engine = process.env.PROBE_BROWSER === 'firefox' ? firefox : chromium;
const browser = await engine.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await signIn(page, 'dev');
  const state = loadState()!;
  await page.goto(`${APP}/channels/${state.serverId}/${state.channels.botti}`, { waitUntil: 'networkidle' });
  await page.locator('.composer').waitFor({ timeout: 15000 });
  await page.locator('section.dock button.me').click();
  await page.getByRole('button', { name: /custom status/i }).click();
  await page.locator('dialog[open]').waitFor();
  await page.waitForTimeout(250);
  await page.addStyleTag({ content: ':root { --dur-exit: 0ms !important; --dur-modal: 0ms !important; --dur-popover: 0ms !important; }' });
  const before = await page.evaluate(() => document.getAnimations().map(a => ({ type: a.constructor.name, state: a.playState, duration: a.effect?.getComputedTiming().duration })));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ stillOpen: !!document.querySelector('dialog[open]'), animations: document.getAnimations().map(a => ({ type: a.constructor.name, state: a.playState, duration: a.effect?.getComputedTiming().duration })) }));
  console.log('DIALOG', JSON.stringify({ before, ...after }));
  const zeroAnimation = await page.evaluate(async () => {
    const node = document.createElement('div'); document.body.append(node);
    const animation = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 0 });
    const immediate = { present: document.getAnimations().includes(animation), state: animation.playState, duration: animation.effect?.getComputedTiming().duration };
    await new Promise(requestAnimationFrame);
    const nextFrame = { present: document.getAnimations().includes(animation), state: animation.playState };
    node.remove(); return { immediate, nextFrame };
  });
  console.log('ZERO_ANIMATION', JSON.stringify(zeroAnimation));
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.probe-parent { width:180px;height:100px;overflow:auto } .probe-scroll { width:100px;height:60px;overflow:auto;scrollbar-width:thin;scrollbar-color:transparent transparent } .probe-scroll:hover { scrollbar-color:#667788 transparent } .probe-scroll::-webkit-scrollbar-thumb { background-color: rgb(200, 20, 20); }';
    document.head.append(style);
    const parent = document.createElement('div'); parent.className = 'probe-parent';
    const scroller = document.createElement('div'); scroller.className = 'probe-scroll';
    scroller.innerHTML = '<div style="width:300px;height:300px"></div>'; parent.append(scroller); document.body.append(parent);
    return true;
  });
  const parent = page.locator('.probe-parent'); const scroller = page.locator('.probe-scroll');
  const initial = await scroller.evaluate(e => getComputedStyle(e).scrollbarColor);
  await parent.hover({ position: { x: 150, y: 80 } });
  const ancestorHover = await scroller.evaluate(e => getComputedStyle(e).scrollbarColor);
  await scroller.hover({ position: { x: 20, y: 20 } });
  const scrollerHover = await scroller.evaluate(e => getComputedStyle(e).scrollbarColor);
  const webkitThumbBackground = await scroller.evaluate(e => getComputedStyle(e, '::-webkit-scrollbar-thumb').backgroundColor);
  console.log('SCROLLBAR', JSON.stringify({ initial, ancestorHover, scrollerHover, webkitThumbBackground }));
  await page.evaluate(() => { document.querySelector('.probe-parent')?.remove(); document.querySelector('style:last-of-type')?.remove(); });
  await page.close();
} finally { await browser.close(); }
