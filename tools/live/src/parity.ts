/** M4.6's measured acceptance check, local personas only. Grows with the implementation tasks. */
import { chromium, type Locator, type Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';
import { person } from './people.ts';

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

  // Task 6: the rail pill, 8, 20 and 40 px, growing with a slide in 200 ms and shrinking in 100 ms.
  const server = page.locator(`.rail a.item[href*="/channels/${st.serverId}/"]`);
  const home = page.locator('.rail a.item').first();
  const away = async () => { await page.mouse.move(900, 450); await page.waitForTimeout(300); };
  const pill = (item = server) => item.locator('.pill').evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const inset = /inset\(([\d.]+)(px|%)/.exec(cs.clipPath);
    const top = !inset ? 0 : inset[2] === '%' ? r.height * Number(inset[1]) / 100 : Number(inset[1]);
    const rail = el.closest('.rail')!.getBoundingClientRect();
    const moving = el.getAnimations().map((a) => ({ property: (a as CSSTransition).transitionProperty, duration: Number(a.effect?.getComputedTiming().duration ?? 0) }));
    return { height: Math.round(r.height - 2 * top), inside: r.left >= rail.left - 0.5, opacity: Number(cs.opacity), moving };
  });
  const timed = (moving: { property: string; duration: number }[], ms: number, props = ['clip-path', 'translate', 'opacity']) =>
    props.every((p) => moving.some((a) => a.property === p && a.duration === ms));
  await away();
  const none = await pill(home);
  await home.hover();
  const growing = await pill(home);
  await page.waitForTimeout(300);
  const hovered = await pill(home);
  check(none.opacity === 0 && !none.inside && hovered.height === 20 && hovered.inside && hovered.opacity === 1, `hover pill is 20 px, slid in from out of sight (${none.height} → ${hovered.height})`);
  check(timed(growing.moving, 200), `the pill grows, slides in and brightens over 200 ms (${JSON.stringify(growing.moving)})`);
  await page.mouse.move(900, 450);
  const shrinking = await pill(home);
  check(timed(shrinking.moving, 100), `the pill collapses in 100 ms (${JSON.stringify(shrinking.moving)})`);
  await away();
  const selected = await pill();
  await server.hover();
  const selectedHover = await pill();
  await page.waitForTimeout(300);
  check(selected.height === 40 && selected.inside && (await pill()).height === 40, `selected pill is 40 px, and stays 40 px hovered (${selected.height}, ${(await pill()).height})`);
  check(!selectedHover.moving.length, 'hovering the selected server starts no pill transition');
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await away();
  if (!(await server.evaluate((el) => el.classList.contains('unread')))) {
    const aino = await person('aino');
    await aino.call('POST', `/channels/${st.channels.botti}/messages`, { content: 'Pill unread' });
    await server.and(page.locator('.unread')).waitFor({ timeout: 8_000 });
    await page.waitForTimeout(300);
  }
  const unread = await pill();
  check(unread.height === 8 && unread.inside && unread.opacity === 1, `unread pill is 8 px (${unread.height})`);
  await server.hover();
  const fromUnread = await pill();
  await page.waitForTimeout(300);
  check((await pill()).height === 20 && timed(fromUnread.moving, 200, ['clip-path']), `an unread pill grows to 20 px on hover in 200 ms (${JSON.stringify(fromUnread.moving)})`);
  await page.mouse.move(900, 450);
  const toUnread = await pill();
  await page.waitForTimeout(300);
  check((await pill()).height === 8 && timed(toUnread.moving, 100, ['clip-path']), 'and shrinks back to 8 px in 100 ms');
  await page.goBack({ waitUntil: 'networkidle' });

  // Task 7: channel row actions, by the same checks as the channel menu, with tooltips above.
  const row = (p: Page, name: RegExp) => p.locator('.channels .row', { has: p.getByRole('link', { name }) });
  const actions = async (p: Page, name: RegExp) => {
    await row(p, name).hover();
    return row(p, name).locator('.actions .icon-button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  };
  const devActions = await actions(page, /^yleinen/);
  await row(page, /^yleinen/).getByRole('link').click({ button: 'right' });
  const devMenu = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  check(!devActions.includes('Edit channel') && devActions.includes('Invite to channel') === devMenu.includes('Invite people'), `as dev, no Edit channel, and Invite as the menu has it (${devActions.join(', ')})`);
  const adminContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, reducedMotion: 'no-preference' });
  const admin = await adminContext.newPage();
  await signIn(admin, 'dev-admin');
  await admin.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}`, { waitUntil: 'networkidle' });
  await admin.locator('.composer').waitFor();
  const text = await actions(admin, /^yleinen/);
  const voice = await actions(admin, /^Olohuone/);
  check(text.join() === 'Invite to channel,Edit channel' && voice.join() === 'Open chat,Invite to channel,Edit channel', `as dev-admin: ${text.join(', ')}; on a voice channel ${voice.join(', ')}`);
  const edit = row(admin, /^yleinen/).getByRole('button', { name: 'Edit channel' });
  await row(admin, /^yleinen/).hover();
  await edit.hover();
  await admin.waitForTimeout(200);
  const tip = admin.locator('.concord-tooltip[data-open="true"]');
  check(await tip.getAttribute('data-side') === 'top' && (await tip.innerText()).includes('Edit channel'), 'the row action’s tooltip is above it');
  await row(admin, /^yleinen/).getByRole('button', { name: 'Invite to channel' }).click();
  check(await admin.getByRole('dialog', { name: /^Invite people/ }).waitFor({ timeout: 3_000 }).then(() => true, () => false), 'Invite to channel opens the invite dialog');
  await admin.keyboard.press('Escape');
  await admin.getByRole('dialog', { name: /^Invite people/ }).waitFor({ state: 'hidden', timeout: 3_000 });
  await row(admin, /^yleinen/).hover();
  await edit.click();
  check(await admin.locator('.settings[role="dialog"]').waitFor({ timeout: 3_000 }).then(() => true, () => false)
    && admin.url().endsWith(`/channel-settings/${st.channels.yleinen}/overview`), 'Edit channel opens its settings');
  await admin.keyboard.press('Escape');
  await admin.locator('.settings[role="dialog"]').waitFor({ state: 'detached', timeout: 3_000 });
  await row(admin, /^Olohuone/).hover();
  await row(admin, /^Olohuone/).getByRole('button', { name: 'Open chat' }).click();
  await admin.waitForURL(new RegExp(`/channels/${st.serverId}/${st.channels.olohuone}$`));
  await admin.waitForTimeout(500);
  check(await admin.locator('.side-panel .chat').count() === 1 && await admin.getByText('Voice connected').count() === 0, 'Open chat shows the voice channel with its chat, without joining');
  await adminContext.close();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'User settings', exact: true }).hover();
  const reduced = page.locator('.concord-tooltip[data-open="true"]');
  check(await reduced.evaluate((tip) => getComputedStyle(tip).opacity === '1' && getComputedStyle(tip).transitionDuration === '0s' && !tip.getAnimations().length), 'reduced motion: tooltip appears without animation');
} finally { await browser.close(); }
console.log(failures.length ? `parity: ${failures.length} failed` : 'parity: all passed');
process.exit(failures.length ? 1 : 0);
