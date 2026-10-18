<script lang="ts">
  /**
   * The emoji picker (client.md section 6.4): search, favourites, frequently used, one section per server
   * for custom emoji, then Unicode categories, with a preview footer. In reaction mode it offers only
   * what Stoat accepts. Shift+click picks without closing, as on Discord.
   */
  import { duration, Popover, Spinner } from '@concord/ui';
  import Apple from '@lucide/svelte/icons/apple';
  import Cat from '@lucide/svelte/icons/cat';
  import Clock from '@lucide/svelte/icons/clock';
  import Flag from '@lucide/svelte/icons/flag';
  import Gamepad from '@lucide/svelte/icons/gamepad-2';
  import Heart from '@lucide/svelte/icons/heart';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import Plane from '@lucide/svelte/icons/plane';
  import Smile from '@lucide/svelte/icons/smile';
  import Star from '@lucide/svelte/icons/star';
  import UserRound from '@lucide/svelte/icons/user-round';
  import type { Component } from 'svelte';
  import { tick, untrack } from 'svelte';
  import { m } from '$lib/i18n/index.ts';
  import { customEmojiUrl, twemojiUrl } from '$lib/markdown/emoji.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { orderedServers } from '$lib/view/channels.ts';
  import { GROUPS, unicodeEmoji, type UnicodeEmoji } from './data.ts';
  import { picker } from './picker.svelte.ts';

  interface Item { key: string; kind: 'unicode' | 'custom'; src: string; name: string }
  interface Section { id: string; title: string; items: Item[]; icon?: Component | undefined; image?: string | undefined }

  const COLUMNS = 9;
  const GROUP_ICONS: Record<number, Component> = { 0: Smile, 1: UserRound, 3: Cat, 4: Apple, 5: Plane, 6: Gamepad, 7: Lightbulb, 8: Heart, 9: Flag };

  const session = $derived(app.session);
  const store = $derived(session?.store);
  let { host = 'shell' }: { host?: string } = $props();
  const req = $derived(picker.request?.host === host ? picker.request : null);
  let all = $state<UnicodeEmoji[]>([]);
  let allowed = $state<((emoji: string) => string | null) | null>(null);
  let query = $state('');
  let preview = $state<Item | null>(null);
  let scroller = $state<HTMLDivElement | null>(null);

  // Each opening starts with an empty search; the data loads once, in the background.
  $effect(() => {
    if (!req) return;
    untrack(() => {
      query = '';
      preview = null;
      if (!all.length) void unicodeEmoji().then((d) => (all = d));
      if (req.mode === 'react' && !allowed && session) void session.backend.reactionEmoji().then((f) => (allowed = f));
    });
  });

  const unicodeItem = (e: UnicodeEmoji): Item => ({ key: e.unicode, kind: 'unicode', src: twemojiUrl(e.unicode), name: e.shortcode });
  const byUnicode = $derived(new Map(all.map((e) => [e.unicode, e])));
  const itemFor = (key: string): Item | null => {
    const custom = store?.emojis.get(key);
    if (custom) return { key, kind: 'custom', src: customEmojiUrl(key), name: custom.name };
    const u = byUnicode.get(key);
    return u ? unicodeItem(u) : null;
  };
  const usable = (i: Item) => (req?.mode === 'unicode' ? i.kind === 'unicode' : req?.mode !== 'react' || i.kind === 'custom' || !!allowed?.(i.key));

  const sections = $derived.by((): Section[] => {
    // Wait for the data, and in reaction mode for the allowlist, rather than show a partial list.
    if (!store || !req || !all.length || (req.mode === 'react' && !allowed)) return [];
    const q = query.trim().toLowerCase().replace(/^:|:$/g, '');
    const customs = orderedServers(store).map((s) => ({
      server: s,
      items: [...store.emojis.values()].filter((e) => e.parent.type === 'server' && e.parent.id === s.id)
        .sort((a, b) => a.name.localeCompare(b.name)).map((e): Item => ({ key: e.id, kind: 'custom', src: customEmojiUrl(e.id), name: e.name })),
    })).filter((s) => s.items.length);
    if (q) {
      const hits = [
        ...customs.flatMap((s) => s.items).filter((i) => i.name.toLowerCase().includes(q)),
        ...all.filter((e) => e.terms.includes(q)).map(unicodeItem),
      ].filter(usable);
      return [{ id: 'results', title: m.emoji.results, items: hits }];
    }
    const prefs = store.emojiPrefs;
    const favourites = prefs.favourites.map(itemFor).filter((i): i is Item => !!i && usable(i));
    const frequent = Object.entries(prefs.usage).sort((a, b) => b[1] - a[1]).map(([k]) => itemFor(k))
      .filter((i): i is Item => !!i && usable(i)).slice(0, COLUMNS * 2);
    return [
      ...(favourites.length ? [{ id: 'favourites', title: m.emoji.favourites, items: favourites, icon: Star }] : []),
      ...(frequent.length ? [{ id: 'frequent', title: m.emoji.frequent, items: frequent, icon: Clock }] : []),
      ...(req.mode === 'unicode' ? [] : customs.map((s) => ({ id: `server-${s.server.id}`, title: s.server.name, items: s.items, image: s.items[0]!.src }))),
      ...GROUPS.map((g) => ({ id: `group-${g}`, title: m.emoji.groups[g] ?? '', items: all.filter((e) => e.group === g).map(unicodeItem).filter(usable), icon: GROUP_ICONS[g] })),
    ].filter((s) => s.items.length);
  });

  /** Sections with each item's place in one flat list, for arrow-key movement. */
  const laidOut = $derived.by(() => {
    let n = 0;
    return sections.map((s) => ({ ...s, start: (n += s.items.length) - s.items.length }));
  });

  // Some 1,900 buttons would stall the opening animation for a long frame (M4.2). The picker opens with the first
  // view's worth, then adds a few rows a frame once the animation has run.
  const FIRST = COLUMNS * 12;
  const STEP = COLUMNS * 16;
  let limit = $state(FIRST);
  const visible = $derived(laidOut.filter((s) => s.start < limit).map((s) => ({ ...s, items: s.items.slice(0, limit - s.start) })));
  $effect(() => {
    if (!req) { limit = FIRST; return; }
    const total = laidOut.reduce((n, s) => n + s.items.length, 0);
    let frame = 0;
    const grow = () => { if (untrack(() => limit) < total) { limit += STEP; frame = requestAnimationFrame(grow); } };
    const timer = setTimeout(grow, duration('--dur-popover'));
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  });

  function pick(item: Item, keepOpen: boolean) {
    if (!req || !session) return;
    req.onpick({ kind: item.kind, value: item.key });
    session.useEmoji(item.key);
    if (!keepOpen) picker.close();
  }

  // Right-click on desktop, or a long press on touch, toggles a favourite.
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressed = false;
  function pressStart(e: PointerEvent, item: Item) {
    if (e.pointerType !== 'touch') return;
    pressed = false;
    pressTimer = setTimeout(() => { pressed = true; session?.toggleFavourite(item.key); }, 500);
  }
  function pressEnd() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function focusIndex(i: number) {
    const el = scroller?.querySelector<HTMLButtonElement>(`[data-index="${i}"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  }
  function gridKey(e: KeyboardEvent) {
    const i = Number((e.target as HTMLElement).dataset.index);
    if (Number.isNaN(i)) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key];
    if (!step) return;
    e.preventDefault();
    focusIndex(Math.max(0, i + step));
  }
  function searchKey(e: KeyboardEvent) {
    const first = sections[0]?.items[0];
    if (e.key === 'Enter' && first) { e.preventDefault(); pick(first, e.shiftKey); }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIndex(0); }
  }
  async function jump(id: string) {
    query = '';
    limit = Infinity;
    await tick();
    scroller?.querySelector(`#emoji-${id}`)?.scrollIntoView({ block: 'start' });
  }
</script>

<Popover anchor={req?.anchor ?? null} open={!!req} onclose={() => picker.close()} side="top" label={m.emoji.picker}>
  <div class="picker">
    <input class="search" type="search" bind:value={query} placeholder={m.emoji.search} aria-label={m.emoji.search} onkeydown={searchKey} />
    <div class="body">
      {#if !query}
        <nav class="nav">
          {#each laidOut as s (s.id)}
            <button title={s.title} aria-label={s.title} onclick={() => jump(s.id)}>
              {#if s.image}<img src={s.image} alt="" width="20" height="20" />{:else if s.icon}<s.icon size={18} />{/if}
            </button>
          {/each}
        </nav>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scroll" bind:this={scroller} onkeydown={gridKey}>
        {#each visible as s (s.id)}
          <section aria-labelledby="emoji-{s.id}-title">
            <h3 id="emoji-{s.id}"><span id="emoji-{s.id}-title">{s.title}</span></h3>
            <div class="grid">
              {#each s.items as item, i (item.key)}
                <button data-index={s.start + i} aria-label={`:${item.name}:`}
                  onclick={(e) => { if (pressed) { pressed = false; return; } pick(item, e.shiftKey); }}
                  oncontextmenu={(e) => { e.preventDefault(); session?.toggleFavourite(item.key); }}
                  onpointerdown={(e) => pressStart(e, item)} onpointerup={pressEnd} onpointerleave={pressEnd}
                  onmouseenter={() => (preview = item)} onfocus={() => (preview = item)}>
                  <img src={item.src} alt="" width="32" height="32" loading="lazy" draggable="false" />
                </button>
              {/each}
            </div>
          </section>
        {:else}
          <p class="empty">{#if query && all.length && (req?.mode !== 'react' || allowed)}{m.emoji.noResults}{:else}<Spinner label={m.app.loading} />{/if}</p>
        {/each}
      </div>
    </div>
    <footer>
      {#if preview}
        <img src={preview.src} alt="" width="28" height="28" />
        <span class="name">:{preview.name}:</span>
        {#if store?.emojiPrefs.favourites.includes(preview.key)}<span class="fav" title={m.emoji.favourited}><Star size={14} /></span>{/if}
      {:else}
        <span class="hint">{m.emoji.favouriteHint}</span>
      {/if}
    </footer>
  </div>
</Popover>

<style>
  .picker { display: flex; flex-direction: column; width: min(var(--picker-w), calc(100vw - 2 * var(--space-4))); height: min(var(--picker-h), 70vh); }
  .search {
    margin: var(--space-4) var(--space-4) var(--space-3); min-height: var(--control-h); padding: 0 var(--space-3);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-0); color: var(--text-normal); font: var(--text-md) var(--font-sans);
  }
  .body { flex: 1; min-height: 0; display: flex; }
  .nav { display: flex; flex-direction: column; gap: var(--space-1); padding: 0 var(--space-2); overflow-y: auto; border-right: 1px solid var(--border-subtle); }
  .nav button { display: grid; place-items: center; width: 2rem; height: 2rem; flex: none; padding: 0; border: 0; border-radius: var(--radius-md); background: none; color: var(--text-secondary); cursor: pointer; }
  @media (hover: hover) { .nav button:hover { background: var(--hover-overlay); color: var(--text-strong); } }
  .nav img { width: 1.25rem; height: 1.25rem; object-fit: contain; }
  .scroll { flex: 1; min-width: 0; overflow-y: auto; padding: 0 var(--space-3) var(--space-3); }
  h3 { position: sticky; top: 0; z-index: 1; margin: 0; padding: var(--space-3) var(--space-1) var(--space-2); background: var(--surface-1); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); text-transform: uppercase; }
  section { content-visibility: auto; contain-intrinsic-size: auto 12rem; }
  .grid { display: grid; grid-template-columns: repeat(9, 1fr); }
  .grid button { display: grid; place-items: center; aspect-ratio: 1; padding: var(--space-1); border: 0; border-radius: var(--radius-md); background: none; cursor: pointer; }
  .grid button:focus-visible { background: var(--hover-overlay); outline: none; }
  @media (hover: hover) { .grid button:hover { background: var(--hover-overlay); } }
  .grid img { width: 100%; max-width: 2rem; height: auto; object-fit: contain; }
  .empty { margin: var(--space-6) 0; text-align: center; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  footer { display: flex; align-items: center; gap: var(--space-3); min-height: 3rem; padding: 0 var(--space-4); border-top: 1px solid var(--border-subtle); background: var(--surface-2); border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
  .name { color: var(--text-strong); font: 700 var(--text-md) var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fav { display: grid; color: var(--accent); }
  .hint { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
