<script lang="ts">
  /**
   * Bots (m4.3-plan.md review point N): make and manage your own, and add a bot to a server or group. A bot's token
   * is a credential: it is fetched only when its owner opens the token dialog, lives in that dialog, and goes with it.
   * A link to `?add=<bot ID>` opens the add dialog, which is what Copy invite link gives.
   */
  import BotIcon from '@lucide/svelte/icons/bot';
  import Search from '@lucide/svelte/icons/search';
  import { page } from '$app/state';
  import { Avatar, Button, Dialog, TextField, Toggle } from '@concord/ui';
  import { Permission, has, isUlid, type Bot, type Id, type PublicBot, type Session } from '@concord/domain';
  import { BackendError } from '@concord/domain/errors';
  import { m } from '$lib/i18n/index.ts';
  import { serverPerms } from '$lib/view/admin.ts';
  import { permissionsIn } from '$lib/view/channels.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { avatarUrl } from '$lib/view/users.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const t = m.bots;
  const NAME = /^(\p{L}|[\d_.-]){2,32}$/u;

  function explain(e: unknown): string {
    if (!(e instanceof BackendError)) return t.errors.unknown;
    switch (e.kind) {
      case 'ReachedMaximumBots': return t.errors.limit;
      case 'BotIsPrivate': return t.errors.private;
      case 'UsernameTaken': case 'InvalidUsername': case 'FailedValidation': return t.errors.name;
      case 'MissingPermission': case 'NotElevated': return t.errors.permission;
      case 'AlreadyInServer': case 'AlreadyInGroup': return t.errors.already;
      case 'Banned': return t.errors.banned;
      case 'NotFound': return t.errors.notFound;
    }
    return e.status === 404 ? t.errors.notFound : t.errors.unknown;
  }
  const fail = (e: unknown) => toasts.show(explain(e));
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toasts.show(t.copied, 'info'), () => toasts.show(t.copyFailed));
  const tag = (id: Id) => { const u = store.users.get(id); return u ? `${u.username}#${u.discriminator}` : id; };
  const nameOf = (id: Id) => store.users.get(id)?.username ?? id;

  // ---------- your bots ----------
  let owned = $state<Bot[] | null>(null);
  let newName = $state('');
  let busy = $state(false);
  async function load() {
    try {
      const r = await session.backend.ownedBots();
      store.upsertUsers(r.users);
      owned = r.bots;
    } catch {
      owned = [];
    }
  }
  $effect(() => { void load(); });

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (busy || !NAME.test(name)) return;
    busy = true;
    try {
      const r = await session.backend.createBot(name);
      store.upsertUsers([r.user]);
      owned = [...(owned ?? []), r.bot];
      newName = '';
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function setPublic(bot: Bot, on: boolean) {
    owned = (owned ?? []).map((b) => (b.id === bot.id ? { ...b, public: on } : b));
    try {
      await session.backend.editBot(bot.id, { public: on });
    } catch (err) {
      owned = (owned ?? []).map((b) => (b.id === bot.id ? { ...b, public: !on } : b));
      fail(err);
    }
  }

  async function remove(bot: Bot) {
    if (!(await confirm.ask({ title: t.deleteTitle(nameOf(bot.id)), body: t.deleteBody, confirm: t.delete, danger: true }))) return;
    try {
      await session.backend.deleteBot(bot.id);
      owned = (owned ?? []).filter((b) => b.id !== bot.id);
    } catch (err) {
      fail(err);
    }
  }

  let renaming = $state<{ bot: Bot; name: string } | null>(null);
  async function rename(e: SubmitEvent) {
    e.preventDefault();
    const r = renaming;
    if (!r || busy || !NAME.test(r.name.trim())) return;
    busy = true;
    try {
      store.upsertUsers([(await session.backend.editBot(r.bot.id, { name: r.name.trim() })).user]);
      renaming = null;
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  // ---------- the token: only in this dialog, only while it is open ----------
  let tokenFor = $state<Bot | null>(null);
  let token = $state('');
  async function openToken(bot: Bot) {
    token = '';
    tokenFor = bot;
    try {
      const value = await session.backend.botToken(bot.id);
      if (tokenFor?.id === bot.id) token = value;
    } catch (err) {
      tokenFor = null;
      fail(err);
    }
  }
  function closeToken() {
    tokenFor = null;
    token = '';
  }
  async function resetToken() {
    const bot = tokenFor;
    if (!bot || !(await confirm.ask({ title: t.resetTitle, body: t.resetBody, confirm: t.reset, danger: true }))) return;
    try {
      const value = await session.backend.resetBotToken(bot.id);
      if (tokenFor?.id === bot.id) token = value;
    } catch (err) {
      fail(err);
    }
  }

  // ---------- adding a bot somewhere ----------
  let adding = $state<PublicBot | null>(null);
  let place = $state('');
  const servers = $derived([...store.servers.values()].filter((s) => has(serverPerms(store, s.id), Permission.ManageServer))
    .sort((a, b) => a.name.localeCompare(b.name)));
  const groups = $derived([...store.channels.values()].filter((c) => c.kind === 'group' && has(permissionsIn(store, c), Permission.InviteOthers))
    .map((c) => ({ id: c.id, name: c.kind === 'group' ? c.name : '' })).sort((a, b) => a.name.localeCompare(b.name)));

  async function openAdd(id: Id) {
    try {
      adding = await session.backend.publicBot(id);
      place = servers[0] ? `server:${servers[0].id}` : groups[0] ? `group:${groups[0].id}` : '';
    } catch (err) {
      fail(err);
    }
  }
  async function add() {
    const bot = adding;
    const [kind, id] = place.split(':');
    if (!bot || !id || busy) return;
    busy = true;
    try {
      await session.backend.inviteBot(bot.id, kind === 'server' ? { server: id } : { group: id });
      const where = kind === 'server' ? store.servers.get(id)?.name : groups.find((g) => g.id === id)?.name;
      toasts.show(t.added(bot.username, where ?? ''), 'info');
      adding = null;
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  // An invite link: /app/channels/@me/bots?add=<bot ID>. Each link opens its dialog once.
  let opened = '';
  $effect(() => {
    const id = page.url.searchParams.get('add') ?? '';
    if (id === opened || !isUlid(id)) return;
    opened = id;
    void openAdd(id);
  });
  const linkFor = (id: Id) => `${location.origin}/app/channels/@me/bots?add=${id}`;

  let lookup = $state('');
  let lookupError = $state<string | undefined>();
  function find(e: SubmitEvent) {
    e.preventDefault();
    const id = /[0-9A-HJKMNP-TV-Z]{26}/.exec(lookup.trim())?.[0];
    lookupError = id ? undefined : t.byIdInvalid;
    if (id) void openAdd(id).then(() => (lookup = ''));
  }

  // ---------- bots this account has met ----------
  let query = $state('');
  const mine = $derived(new Set((owned ?? []).map((b) => b.id)));
  const met = $derived([...store.users.values()]
    .filter((u) => u.bot && !mine.has(u.id) && u.username.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.username.localeCompare(b.username)));
</script>

<header class="header">
  <span class="narrow-only"><button class="menu" aria-label={m.shell.openSidebar} onclick={() => (shell.sidebarOpen = true)}>☰</button></span>
  <span class="heading-icon" aria-hidden="true"><BotIcon size={22} /></span>
  <h1>{t.title}</h1>
  <span class="divider" aria-hidden="true"></span>
  <span class="subtitle">{t.subtitle}</span>
</header>

<div class="content">
  <section>
    <h2>{t.yours}</h2>
    <p class="help">{t.yoursHelp}</p>
    <form class="line" onsubmit={create}>
      <TextField label={t.name} bind:value={newName} hint={t.nameHint} maxlength={32} autocomplete="off" />
      <Button type="submit" {busy} disabled={!NAME.test(newName.trim())}>{t.create}</Button>
    </form>
    {#if owned?.length}
      <ul class="list">
        {#each owned as bot (bot.id)}
          <li class="card">
            <Avatar src={avatarUrl(store.users.get(bot.id) ?? { id: bot.id })} size={40} />
            <div class="who">
              <span class="name">{tag(bot.id)}</span>
              <label class="public" title={t.publicHelp}>
                <Toggle checked={bot.public} onchange={(on) => void setPublic(bot, on)} aria-label={t.publicSwitch(nameOf(bot.id))} />
                <span>{bot.public ? t.public : t.private}</span>
              </label>
            </div>
            <div class="actions">
              <Button size="sm" onclick={() => void openAdd(bot.id)}>{t.add}</Button>
              <Button size="sm" variant="secondary" onclick={() => void openToken(bot)}>{t.token}</Button>
              <Button size="sm" variant="secondary" onclick={() => void copy(linkFor(bot.id))}>{t.copyLink}</Button>
              <Button size="sm" variant="secondary" onclick={() => (renaming = { bot, name: nameOf(bot.id) })}>{t.rename}</Button>
              <Button size="sm" variant="danger" onclick={() => void remove(bot)}>{t.delete}</Button>
            </div>
          </li>
        {/each}
      </ul>
    {:else if owned}
      <p class="empty">{t.none}</p>
    {/if}
  </section>

  <section>
    <h2>{t.byId}</h2>
    <form class="line" onsubmit={find}>
      <TextField label={t.byIdLabel} hideLabel placeholder={t.byIdLabel} bind:value={lookup} error={lookupError} autocomplete="off" />
      <Button type="submit" variant="secondary" disabled={!lookup.trim()}>{t.byIdButton}</Button>
    </form>
  </section>

  <section>
    <div class="head">
      <div><h2>{t.others}</h2><p class="help">{t.othersHelp}</p></div>
      <label class="search"><Search size={18} aria-hidden="true" /><input type="search" bind:value={query} placeholder={t.search} aria-label={t.search} /></label>
    </div>
    {#if met.length}
      <ul class="list">
        {#each met as u (u.id)}
          <li class="card">
            <Avatar src={avatarUrl(u)} size={40} />
            <div class="who">
              <span class="name">{u.displayName ?? u.username}</span>
              {#if u.bot && store.users.has(u.bot.owner)}<span class="owner">{t.ownedBy(nameOf(u.bot.owner))}</span>{/if}
            </div>
            <div class="actions"><Button size="sm" variant="secondary" onclick={() => void openAdd(u.id)}>{t.add}</Button></div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{query.trim() ? t.empty : t.othersNone}</p>
    {/if}
  </section>
</div>

<Dialog open={!!adding} title={adding ? t.addTitle(adding.username) : ''} onclose={() => (adding = null)}>
  {#if adding}
    <div class="adding">
      <Avatar src={adding.avatar ? `/autumn/avatars/${adding.avatar}?max_side=256` : avatarUrl({ id: adding.id })} size={48} />
      <div><strong>{adding.username}</strong>{#if adding.description}<p>{adding.description}</p>{/if}</div>
    </div>
    <p class="help">{t.addWarning}</p>
    {#if servers.length || groups.length}
      <label class="where"><span>{t.addWhere}</span>
        <select bind:value={place}>
          {#if servers.length}<optgroup label={t.addServers}>{#each servers as s (s.id)}<option value="server:{s.id}">{s.name}</option>{/each}</optgroup>{/if}
          {#if groups.length}<optgroup label={t.addGroups}>{#each groups as g (g.id)}<option value="group:{g.id}">{g.name}</option>{/each}</optgroup>{/if}
        </select>
      </label>
    {:else}
      <p>{t.addNowhere}</p>
    {/if}
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (adding = null)}>{t.cancel}</Button>
    <Button {busy} disabled={!place} onclick={() => void add()}>{t.add}</Button>
  {/snippet}
</Dialog>

<Dialog open={!!tokenFor} title={tokenFor ? t.tokenTitle(nameOf(tokenFor.id)) : ''} onclose={closeToken}>
  <p class="help">{t.tokenHelp}</p>
  <input class="token" readonly value={token} aria-label={t.tokenLabel} onfocus={(e) => e.currentTarget.select()} />
  {#snippet actions()}
    <Button variant="danger" onclick={() => void resetToken()}>{t.reset}</Button>
    <Button variant="secondary" disabled={!token} onclick={() => void copy(token)}>{t.copy}</Button>
    <Button onclick={closeToken}>{t.close}</Button>
  {/snippet}
</Dialog>

<Dialog open={!!renaming} title={renaming ? t.renameTitle(nameOf(renaming.bot.id)) : ''} onclose={() => (renaming = null)}>
  {#if renaming}
    <form id="bot-rename" onsubmit={rename}>
      <TextField label={t.name} bind:value={renaming.name} hint={t.nameHint} maxlength={32} autocomplete="off" />
    </form>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (renaming = null)}>{t.cancel}</Button>
    <Button type="submit" form="bot-rename" {busy} disabled={!renaming || !NAME.test(renaming.name.trim())}>{t.save}</Button>
  {/snippet}
</Dialog>

<style>
  .header { display: flex; align-items: center; gap: var(--space-4); min-height: var(--header-h); padding: 0 var(--space-5); border-bottom: 1px solid var(--border-subtle); min-width: 0; }
  .heading-icon { display: grid; color: var(--text-muted); flex: none; }
  h1 { margin: 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); flex: none; }
  .divider { width: 1px; height: 1.5rem; background: var(--border-default); flex: none; }
  .subtitle { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .content { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-6); display: grid; align-content: start; gap: var(--space-8); max-width: 56rem; }
  h2 { margin: 0 0 var(--space-1); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .help { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .line { display: flex; align-items: start; gap: var(--space-3); max-width: 32rem; }
  .line > :global(.field) { flex: 1; }
  .line > :global(.button) { margin-top: 1.625rem; }
  section:nth-of-type(2) .line > :global(.button) { margin-top: 0; }
  .list { display: grid; gap: var(--space-3); margin: var(--space-5) 0 0; padding: 0; list-style: none; }
  .card { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-1); }
  .who { display: grid; gap: var(--space-1); min-width: 8rem; flex: 1; }
  .name { color: var(--text-strong); font: 600 var(--text-md) var(--font-sans); overflow-wrap: anywhere; }
  .owner { color: var(--text-muted); font: var(--text-xs) var(--font-sans); }
  .public { display: flex; align-items: center; gap: var(--space-3); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .empty { margin: var(--space-4) 0 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .head { display: flex; align-items: end; justify-content: space-between; gap: var(--space-5); }
  .search { display: flex; align-items: center; gap: var(--space-3); width: min(18rem, 45%); min-height: var(--control-h); padding: 0 var(--space-3); border: 1px solid var(--border-control); border-radius: var(--radius-md); color: var(--text-muted); background: var(--surface-0); }
  .search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-strong); font: var(--text-sm) var(--font-sans); }
  .adding { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4); }
  .adding strong { color: var(--text-strong); }
  .adding p { margin: var(--space-1) 0 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .where { display: grid; gap: var(--space-3); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); text-transform: uppercase; }
  select { min-height: var(--control-h); padding: 0 var(--space-3); border: 1px solid var(--border-control); border-radius: var(--radius-md); background: var(--surface-0); color: var(--text-strong); font: var(--text-md) var(--font-sans); }
  .token { width: 100%; min-height: var(--control-h); padding: 0 var(--space-3); border: 1px solid var(--border-control); border-radius: var(--radius-md); background: var(--surface-0); color: var(--text-strong); font: var(--text-sm) ui-monospace, Menlo, Consolas, monospace; }
  .narrow-only, .menu { display: none; }
  @media (max-width: 700px) {
    .header { gap: var(--space-3); padding: 0 var(--space-3); }
    .subtitle, .divider, .heading-icon { display: none; }
    .narrow-only { display: contents; }
    .menu { display: block; border: 0; background: none; color: var(--text-secondary); font-size: 1.25rem; }
    .content { padding: var(--space-4); }
    .head { align-items: stretch; flex-direction: column; }
    .search { width: 100%; }
  }
</style>
