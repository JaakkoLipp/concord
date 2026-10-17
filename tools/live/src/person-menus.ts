/**
 * m4.7-plan.md task 4 on a throwaway local server. Compares the person and server menus for the owner on another
 * member, the owner on themself, and a plain member on that same target. It also exercises Roles, keyboard and
 * hover submenus, Mention, the moderation panel, and synced hide-muted channels.
 * Usage: node tools/live/src/person-menus.ts
 */
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';
import { unrelate, until } from './people.ts';
import { serversOf } from './servers.ts';
import { voiceBrowser } from './calls.ts';
import { cleanup, setup } from './probe-moderation.ts';

await assertDevStack();
const p = await setup();
const failures: string[] = [];
const check = (ok: boolean, what: string, actual?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${actual === undefined ? '' : ` -> ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(what);
};
const browser: Browser = await chromium.launch({ headless: true });
let callBrowser: Browser | null = null;
const pages = new Map<string, Page>();
const menu = (page: Page) => page.getByRole('menu').first();
const members = (page: Page) => page.getByRole('complementary', { name: 'Members' }).or(page.locator('aside[aria-label="Members"]'));
const row = (page: Page, name: string) => members(page).getByRole('button', { name: new RegExp(`^Open profile of ${name}$`, 'i') });

async function open(handle: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1450, height: 920 } });
  const page = await context.newPage();
  pages.set(handle, page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor({ timeout: 15_000 });
  await members(page).waitFor({ timeout: 10_000 });
  return page;
}

async function openPerson(page: Page, name: string): Promise<string[]> {
  await page.keyboard.press('Escape');
  await row(page, name).click({ button: 'right' });
  await menu(page).waitFor({ timeout: 4_000 });
  return menuLabels(page);
}

async function menuLabels(page: Page): Promise<string[]> {
  return menu(page).evaluate((el) => Array.from(el.children).map((child) => {
    if (child.getAttribute('role') === 'separator') return '|';
    const button = child as HTMLButtonElement;
    return button.querySelector('.label > span')?.textContent?.trim() || button.innerText.trim();
  }));
}

async function openSubmenu(page: Page, label: string, how: 'keyboard' | 'hover' | 'click' = 'keyboard') {
  const item = menu(page).getByRole('menuitem', { name: new RegExp(`^${label}`) });
  if (how === 'keyboard') {
    await item.focus();
    await page.keyboard.press('ArrowRight');
  } else if (how === 'hover') {
    await item.hover();
    await page.getByRole('menu', { name: label }).waitFor({ timeout: 3_000 });
  } else await item.click();
  const sub = page.getByRole('menu', { name: label });
  await sub.waitFor({ timeout: 3_000 });
  return sub;
}

async function closeMenu(page: Page) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }

try {
  // The owner and target become friends so Invite to server and Remove friend are both present.
  await unrelate(p.owner, p.target);
  await p.owner.call('POST', '/users/friend', { username: p.target.tag });
  await p.target.call('PUT', `/users/${p.owner.id}/friend`);
  await p.owner.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { can_publish: false, can_receive: false });

  const owner = await open('dev-admin');
  const plain = await open('dev');

  const targetExpected = [
    'Profile', 'Mention', 'Message', 'Start call', '|',
    'Change nickname', 'Invite to server', 'Remove friend', 'Block', '|',
    'Roles', '|', 'Open in moderation view', 'Time out', 'Kick', 'Ban', '|', 'Copy user ID',
  ];
  const targetLabels = await openPerson(owner, p.target.handle);
  check(JSON.stringify(targetLabels) === JSON.stringify(targetExpected), 'owner on target: visible labels, separators and order match task 4, with task 6’s Time out', targetLabels);

  // Give and take the one assignable role, with the keyboard, and verify the menu stays open after each check.
  const roles = await openSubmenu(owner, 'Roles', 'keyboard');
  const roleCheckbox = roles.getByRole('menuitemcheckbox', { name: 'Moderator', exact: true });
  await roleCheckbox.click();
  const gotRole = await until(async () => (await p.owner.call<{ roles?: string[] }>('GET', `/servers/${p.server}/members/${p.target.id}`)).roles?.includes(p.modRole) ?? false).then(() => true, () => false);
  check(gotRole && await menu(owner).isVisible(), 'Roles gives a role and leaves both menus open');
  await roleCheckbox.click();
  const lostRole = await until(async () => !(await p.owner.call<{ roles?: string[] }>('GET', `/servers/${p.server}/members/${p.target.id}`)).roles?.includes(p.modRole)).then(() => true, () => false);
  check(lostRole && await menu(owner).isVisible(), 'Roles takes a role and leaves both menus open');
  await closeMenu(owner);

  // The profile card's Roles row has a "+" opening the same list, without closing the card.
  await row(owner, p.target.handle).click();
  const card = owner.locator('.card');
  await card.getByRole('button', { name: 'Roles…' }).click();
  const cardRole = owner.getByRole('menu', { name: 'Roles' }).getByRole('menuitemcheckbox', { name: 'Moderator', exact: true });
  await cardRole.click();
  const cardGave = await until(async () => (await p.owner.call<{ roles?: string[] }>('GET', `/servers/${p.server}/members/${p.target.id}`)).roles?.includes(p.modRole) ?? false).then(() => true, () => false);
  check(cardGave && await card.isVisible(), 'the profile card’s + gives a role and the card stays open');
  await cardRole.click();
  // Stoat's per-server bucket (5 per 10 s) may still be spent by the toggles above.
  const cardTook = await until(async () => !(await p.owner.call<{ roles?: string[] }>('GET', `/servers/${p.server}/members/${p.target.id}`)).roles?.includes(p.modRole), 25_000).then(() => true, () => false);
  check(cardTook, 'and the + takes it away again');
  await closeMenu(owner);
  await owner.keyboard.press('Escape');
  await row(plain, p.target.handle).click();
  check(await plain.locator('.card').getByRole('button', { name: 'Roles…' }).count() === 0, 'a plain member’s profile card has no +');
  await plain.keyboard.press('Escape');

  // Open Invite to server by hover, then check the submenu contents and close it with Left.
  await openPerson(owner, p.target.handle);
  const probeServerName = (await serversOf(p.owner)).find((server) => server._id === p.server)?.name ?? '';
  const invites = await openSubmenu(owner, 'Invite to server', 'hover');
  check(!!probeServerName && await invites.getByRole('menuitem', { name: probeServerName, exact: true }).count() === 1, 'Invite to server opens on hover and lists the throwaway server', await invites.innerText());
  await owner.keyboard.press('Escape');
  await owner.getByRole('menu', { name: 'Invite to server' }).waitFor({ state: 'detached', timeout: 3_000 });
  check(await menu(owner).isVisible(), 'Escape closes only the open submenu');
  await owner.keyboard.press('Escape');
  await menu(owner).waitFor({ state: 'detached', timeout: 3_000 });
  check(true, 'Escape closes the parent menu after its submenu');
  await openPerson(owner, p.target.handle);
  const keyboardInvites = await openSubmenu(owner, 'Invite to server', 'keyboard');
  check(await keyboardInvites.getByRole('menuitem', { name: probeServerName, exact: true }).count() === 1, 'Right opens Invite to server by keyboard');
  await owner.keyboard.press('ArrowLeft');
  await keyboardInvites.waitFor({ state: 'detached', timeout: 3_000 });
  check(await menu(owner).isVisible(), 'Left closes the Invite to server submenu');
  await owner.keyboard.press('Escape');
  await openPerson(owner, p.target.handle);
  const clickInvites = await openSubmenu(owner, 'Invite to server', 'click');
  check(await clickInvites.getByRole('menuitem', { name: probeServerName, exact: true }).count() === 1, 'click opens Invite to server');
  await clickInvites.getByRole('menuitem', { name: probeServerName, exact: true }).click();
  const dm = (await p.target.call<{ _id: string }>('GET', `/users/${p.owner.id}/dm`))._id;
  const inviteMessages = await until(async () => {
    const messages = await p.target.call<{ content?: string }[]>('GET', `/channels/${dm}/messages?limit=10`);
    return messages.some((message) => /\/invite\/[a-zA-Z0-9]+/.test(message.content ?? ''));
  }, 8_000).then(() => true, () => false);
  const inviteContents = await p.target.call<{ content?: string }[]>('GET', `/channels/${dm}/messages?limit=10`);
  const inviteUrl = inviteContents.map((message) => message.content ?? '').find((content) => /\/invite\//.test(content)) ?? '';
  check(inviteMessages && inviteUrl.startsWith(new URL(APP).origin) && inviteUrl.includes('/invite/'), 'choosing the server sends a valid invite URL in the target DM', inviteUrl);

  // Mention inserts the target's actual Stoat mention token into the active composer.
  await openPerson(owner, p.target.handle);
  await menu(owner).getByRole('menuitem', { name: 'Mention', exact: true }).click();
  const draft = owner.locator('.composer .cm-content');
  const mentionVisible = await until(async () => (await draft.innerText()).toLowerCase().includes(p.target.handle.toLowerCase()), 5_000).then(() => true, () => false);
  const mentionToken = await draft.evaluate((el) => el.textContent ?? '');
  check(mentionVisible, 'Mention inserts the target into the composer', mentionToken);
  await draft.press('Control+A');
  await draft.press('Backspace');

  // Moderation panel exposes the member facts and current server mute/deafen state.
  await openPerson(owner, p.target.handle);
  await menu(owner).getByRole('menuitem', { name: 'Open in moderation view', exact: true }).click();
  const panel = owner.locator('aside[aria-label="Open in moderation view"]');
  await panel.waitFor({ timeout: 5_000 });
  const panelText = (await panel.innerText()).replace(/\s+/g, ' ');
  check(/Joined server/.test(panelText) && /Account created/.test(panelText) && /Roles/.test(panelText) && /Server muted/.test(panelText) && /Server deafened/.test(panelText), 'moderation panel shows member dates, roles, and current voice flags', panelText);
  await panel.getByRole('button', { name: 'Close moderation view' }).click();

  // Self menu: no social or voice actions, with server profile, roles and the moderation view in the specified order.
  const me = await p.owner.call<{ username: string; display_name?: string }>('GET', '/users/@me');
  const selfName = me.display_name || me.username;
  const selfLabels = await openPerson(owner, selfName);
  const selfExpected = ['Profile', 'Mention', '|', 'Edit server profile', '|', 'Roles', '|', 'Open in moderation view', '|', 'Copy user ID'];
  check(JSON.stringify(selfLabels) === JSON.stringify(selfExpected), 'owner on themself: visible labels, separators and order match task 4', selfLabels);
  await menu(owner).getByRole('menuitem', { name: 'Edit server profile', exact: true }).click();
  const profileDialog = owner.getByRole('dialog');
  const originalNickname = (await p.owner.call<{ nickname?: string | null }>('GET', `/servers/${p.server}/members/${p.owner.id}`)).nickname ?? '';
  await profileDialog.getByLabel('Nickname').fill('Menu probe nickname');
  await profileDialog.getByRole('button', { name: 'Save', exact: true }).click();
  const nicknameSaved = await until(async () => (await p.owner.call<{ nickname?: string | null }>('GET', `/servers/${p.server}/members/${p.owner.id}`)).nickname === 'Menu probe nickname').then(() => true, () => false);
  check(nicknameSaved, 'Edit server profile saves the owner nickname');
  await openPerson(owner, 'Menu probe nickname');
  await menu(owner).getByRole('menuitem', { name: 'Edit server profile', exact: true }).click();
  await owner.getByRole('dialog').getByLabel('Nickname').fill(originalNickname);
  await owner.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  let restoredMember: { nickname?: string | null } = {};
  let nicknameRestored = false;
  const restoreDeadline = Date.now() + 24_000;
  while (Date.now() < restoreDeadline && !nicknameRestored) {
    restoredMember = await p.owner.call<{ nickname?: string | null }>('GET', `/servers/${p.server}/members/${p.owner.id}`);
    nicknameRestored = (restoredMember.nickname ?? '') === originalNickname;
    if (!nicknameRestored) await new Promise((resolve) => setTimeout(resolve, 2_200));
  }
  check(nicknameRestored, 'Edit server profile restores the original owner nickname', { originalNickname, actual: restoredMember.nickname ?? '' });
  await closeMenu(owner);

  // A plain member gets the social basics and Copy ID, with no server or moderation controls.
  const plainLabels = await openPerson(plain, p.target.handle);
  const plainExpected = ['Profile', 'Mention', 'Message', 'Start call', '|', 'Add friend', 'Block', '|', 'Copy user ID'];
  check(JSON.stringify(plainLabels) === JSON.stringify(plainExpected), 'plain member on target: visible labels, separators and order match task 4', plainLabels);
  await closeMenu(plain);

  // A fresh voice browser with a fake microphone exercises the Start call action itself.
  callBrowser = await voiceBrowser();
  const callContext = await callBrowser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone'] });
  const callPage = await callContext.newPage();
  pages.set('start-call', callPage);
  await signIn(callPage, 'dev-admin');
  await callPage.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  await row(callPage, p.target.handle).click({ button: 'right' });
  await menu(callPage).getByRole('menuitem', { name: 'Start call', exact: true }).click();
  await callPage.waitForURL(/\/channels\/@me\/[0-9A-Z]{26}/, { timeout: 10_000 });
  const callPanel = callPage.locator('section[aria-label="Voice call"]');
  const calling = await callPanel.getByText('Calling…', { exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
  check(calling, 'Start call opens the target DM and starts its voice call', { url: callPage.url(), panel: await callPanel.innerText().catch(() => '') });
  await callBrowser.close();
  callBrowser = null;
  pages.delete('start-call');

  // Verify server menu grouping, muted-channel hiding, and persistence after a full reload.
  const serverLink = owner.locator(`nav[aria-label="Servers"] a[href*="/channels/${p.server}/"]`).first();
  const serverName = (await serversOf(p.owner)).find((server) => server._id === p.server)?.name ?? '';
  // Make a fresh unread from another member while the owner is on DMs, so Mark as read is present in the server menu.
  await owner.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await p.target.call('POST', `/channels/${p.text}/messages`, { content: `menu probe ${Date.now()}` });
  await serverLink.locator('xpath=..').waitFor();
  await until(async () => (await serverLink.getAttribute('class') ?? '').includes('unread'), 8_000).then(() => true, () => false);
  await serverLink.click({ button: 'right' });
  await menu(owner).waitFor();
  const serverLabels = await menuLabels(owner);
  const serverExpected = ['Mark as read', '|', 'Invite to server', '|', 'Mute server', 'Notification settings', 'Hide muted channels', '|', 'Server settings', 'Edit server profile', '|', 'Create channel', 'Create category', '|', 'Copy server ID'];
  check(!!serverName && JSON.stringify(serverLabels) === JSON.stringify(serverExpected), 'owner server menu: labels, separators and order match task 4', { serverName, serverLabels });
  const settingsItem = menu(owner).getByRole('menuitem', { name: /^Notification settings/ });
  check((await settingsItem.innerText()).includes('Only mentions'), 'Notification settings shows the current server notification level', await settingsItem.innerText());
  const notificationMenu = await openSubmenu(owner, 'Notification settings', 'keyboard');
  const notificationLevels = await notificationMenu.getByRole('menuitemcheckbox').allInnerTexts();
  check(JSON.stringify(notificationLevels) === JSON.stringify(['All messages', 'Only mentions', 'Nothing']), 'Notification settings submenu lists levels in order', notificationLevels);
  await owner.keyboard.press('Escape');
  await notificationMenu.waitFor({ state: 'detached', timeout: 3_000 });
  const settings = await openSubmenu(owner, 'Server settings', 'keyboard');
  const settingSections = await settings.getByRole('menuitem').allInnerTexts();
  const expectedSections = ['Overview', 'Roles', 'Emoji', 'Invites', 'Members', 'Bans'];
  check(JSON.stringify(settingSections) === JSON.stringify(expectedSections) || JSON.stringify(settingSections) === JSON.stringify([...expectedSections, 'Server tag']), 'Server settings submenu lists the sections this owner may open', settingSections);
  await owner.keyboard.press('Escape');
  await settings.waitFor({ state: 'detached', timeout: 3_000 });
  await menu(owner).getByRole('menuitem', { name: 'Mark as read', exact: true }).click();

  // Probe server's initial text channel has a generated name; use its href from the known channel id.
  await owner.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  const textLink = owner.locator(`nav[aria-label="Channels"] a[href*="/${p.server}/${p.text}"]`).first();
  await textLink.click({ button: 'right' });
  await menu(owner).waitFor();
  const muteItem = menu(owner).getByRole('menuitem', { name: 'Mute channel', exact: true });
  check(await muteItem.count() === 1, 'text channel menu offers Mute channel', await menuLabels(owner));
  await muteItem.click();
  await until(async () => (await textLink.getAttribute('class') ?? '').includes('muted'), 5_000);

  await serverLink.click({ button: 'right' });
  await menu(owner).getByRole('menuitemcheckbox', { name: 'Hide muted channels', exact: true }).click();
  await until(async () => !(await owner.locator(`nav[aria-label="Channels"] a[href*="/${p.server}/${p.text}"]`).count()), 5_000);
  await owner.reload({ waitUntil: 'networkidle' });
  const hiddenAfterReload = await owner.locator(`nav[aria-label="Channels"] a[href*="/${p.server}/${p.text}"]`).count() === 0;
  check(hiddenAfterReload, 'Hide muted channels stays enabled after reload and hides the muted channel');
  await serverLink.click({ button: 'right' });
  await menu(owner).getByRole('menuitemcheckbox', { name: 'Hide muted channels', exact: true }).click();
  await owner.locator(`nav[aria-label="Channels"] a[href*="/${p.server}/${p.text}"]`).waitFor({ timeout: 5_000 });
  check(true, 'turning Hide muted channels off shows the muted channel again');
  await textLink.click({ button: 'right' });
  await menu(owner).getByRole('menuitem', { name: 'Unmute channel', exact: true }).click();
  await until(async () => !(await textLink.getAttribute('class') ?? '').includes('muted'), 5_000);

} finally {
  for (const page of pages.values()) await page.context().close().catch(() => {});
  await callBrowser?.close().catch(() => {});
  await browser.close().catch(() => {});
  await p.owner.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { can_publish: true, can_receive: true }).catch(() => {});
  await unrelate(p.owner, p.target).catch(() => {});
  await cleanup(p);
}

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall passed');
