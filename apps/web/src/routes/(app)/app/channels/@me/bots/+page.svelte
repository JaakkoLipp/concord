<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import Search from '@lucide/svelte/icons/search';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Users from '@lucide/svelte/icons/users';
  import { m } from '$lib/i18n/index.ts';
  import { shell } from '$lib/view/shell.svelte.ts';

  type Category = 'All bots' | 'Moderation' | 'Music' | 'Utility' | 'Games';
  type Listing = { name: string; creator: string; description: string; category: Exclude<Category, 'All bots'>; icon: string; color: string; servers: string; tag?: string };
  const categories: Category[] = ['All bots', 'Moderation', 'Music', 'Utility', 'Games'];
  const bots: Listing[] = [
    { name: 'Moss', creator: 'fernworks', description: 'Keep your community kind with gentle, configurable moderation tools.', category: 'Moderation', icon: '🌿', color: '#34785d', servers: '12.4k', tag: 'Popular' },
    { name: 'Orbit', creator: 'pixelpilot', description: 'A little music companion for the moments that bring everyone together.', category: 'Music', icon: '🪐', color: '#6253a5', servers: '8.2k', tag: 'Trending' },
    { name: 'Pebble', creator: 'smallhours', description: 'Reminders, polls, and tidy tools for everyday server life.', category: 'Utility', icon: '🪨', color: '#59708b', servers: '6.8k' },
    { name: 'Mochi', creator: 'cloudberry', description: 'Daily prompts and cozy mini-games for your friends and community.', category: 'Games', icon: '🍡', color: '#bd7188', servers: '4.1k', tag: 'New' },
    { name: 'Lantern', creator: 'nightjar', description: 'Helpful moderation, welcome messages, and safety in one place.', category: 'Moderation', icon: '🏮', color: '#b46c43', servers: '3.7k' },
    { name: 'Daydream', creator: 'softstatic', description: 'Share a soundtrack, discover new artists, and set the room’s mood.', category: 'Music', icon: '☁️', color: '#48869a', servers: '2.9k' },
  ];
  let category = $state<Category>('All bots');
  let query = $state('');
  const visibleBots = $derived(bots.filter((bot) => {
    const matchesCategory = category === 'All bots' || bot.category === category;
    return matchesCategory && `${bot.name} ${bot.creator} ${bot.description} ${bot.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }));
</script>

<header class="header">
  <span class="narrow-only"><button class="menu" aria-label={m.shell.openSidebar} onclick={() => (shell.sidebarOpen = true)}>☰</button></span>
  <span class="heading-icon" aria-hidden="true"><Bot size={22} /></span>
  <h1>{m.bots.title}</h1>
  <span class="divider" aria-hidden="true"></span>
  <span class="subtitle">{m.bots.subtitle}</span>
</header>

<div class="content">
  <section class="intro">
    <div class="intro-copy">
      <span class="eyebrow"><Sparkles size={15} /> {m.bots.eyebrow}</span>
      <h2>{m.bots.heroTitle}</h2>
      <p>{m.bots.heroBody}</p>
    </div>
    <div class="intro-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="planet">✦</span><Bot size={34} /></div>
  </section>

  <div class="browse-head">
    <div><h2>{m.bots.explore}</h2><p>{m.bots.exploreBody}</p></div>
    <label class="search"><Search size={18} aria-hidden="true" /><input type="search" bind:value={query} placeholder={m.bots.search} aria-label={m.bots.search} /><kbd>/</kbd></label>
  </div>
  <nav class="categories" aria-label={m.bots.categories}>
    {#each categories as item (item)}<button class:chosen={category === item} aria-pressed={category === item} onclick={() => (category = item)}>{item}</button>{/each}
  </nav>

  <div class="results" aria-live="polite">
    {#each visibleBots as bot (bot.name)}
      <article class="card">
        <div class="card-top"><div class="bot-icon" style:--bot-color={bot.color} aria-hidden="true">{bot.icon}</div>{#if bot.tag}<span class="tag">{bot.tag}</span>{/if}</div>
        <div class="bot-title"><h3>{bot.name}</h3><span class="verified" aria-label={m.bots.pick}>✦</span></div>
        <p class="creator">{m.bots.by(bot.creator)}</p>
        <p class="description">{bot.description}</p>
        <div class="card-bottom"><span class="category-label">{bot.category}</span><span class="servers"><Users size={14} /> {bot.servers}</span></div>
        <button class="add" type="button" aria-disabled="true">{m.bots.add}</button>
      </article>
    {:else}
      <p class="empty"><Bot size={22} /> {m.bots.empty}</p>
    {/each}
  </div>
</div>

<style>
  .header { display:flex; align-items:center; gap:var(--space-4); min-height:var(--header-h); padding:0 var(--space-5); border-bottom:1px solid var(--border-subtle); min-width:0; }
  .heading-icon { display:grid; color:var(--text-muted); flex:none; }
  h1 { margin:0; color:var(--text-strong); font:500 var(--text-md) var(--font-sans); flex:none; }
  .divider { width:1px; height:1.5rem; background:var(--border-default); flex:none; }
  .subtitle { color:var(--text-secondary); font:var(--text-sm) var(--font-sans); }
  .content { flex:1; min-height:0; overflow-y:auto; padding:var(--space-6); }
  .intro { position:relative; display:flex; align-items:center; justify-content:space-between; min-height:12rem; overflow:hidden; padding:var(--space-6) var(--space-8); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); background:linear-gradient(115deg, color-mix(in srgb, var(--accent) 16%, var(--surface-1)), var(--surface-1) 70%); }
  .intro-copy { position:relative; z-index:1; max-width:38rem; }
  .eyebrow { display:flex; align-items:center; gap:var(--space-2); color:var(--accent); font:700 var(--text-xs) var(--font-sans); letter-spacing:.08em; text-transform:uppercase; }
  .intro h2 { margin:var(--space-3) 0 var(--space-2); color:var(--text-strong); font:700 clamp(1.5rem, 3vw, 2.25rem) var(--font-sans); letter-spacing:-.035em; }
  .intro p { margin:0; color:var(--text-secondary); font:var(--text-md) var(--font-sans); }
  .intro-art { position:absolute; right:8%; top:50%; display:grid; place-items:center; width:9rem; height:9rem; translate:0 -50%; color:var(--accent); }
  .intro-art > :global(svg) { position:relative; z-index:1; width:4.5rem; height:4.5rem; padding:1rem; border:1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius:1.5rem; background:var(--surface-3); box-shadow:var(--shadow-popover); }
  .orbit { position:absolute; width:100%; height:38%; border:1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius:50%; rotate:-28deg; }
  .orbit-two { width:75%; height:115%; rotate:42deg; }
  .planet { position:absolute; top:0; right:0; color:var(--status-idle); font-size:1.3rem; }
  .browse-head { display:flex; align-items:end; justify-content:space-between; gap:var(--space-5); margin:var(--space-8) 0 var(--space-4); }
  .browse-head h2 { margin:0 0 var(--space-1); color:var(--text-strong); font:700 var(--text-lg) var(--font-sans); }
  .browse-head p { margin:0; color:var(--text-secondary); font:var(--text-sm) var(--font-sans); }
  .search { display:flex; align-items:center; gap:var(--space-3); width:min(22rem, 45%); min-height:2.75rem; padding:0 var(--space-3); border:1px solid var(--border-default); border-radius:var(--radius-md); color:var(--text-muted); background:var(--surface-0); }
  .search input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:var(--text-strong); font:var(--text-sm) var(--font-sans); }
  .search kbd { padding:0 var(--space-2); border:1px solid var(--border-subtle); border-radius:var(--radius-xs); color:var(--text-muted); font:var(--text-xs) var(--font-sans); }
  .categories { display:flex; gap:var(--space-2); margin-bottom:var(--space-5); overflow-x:auto; }
  .categories button { flex:none; padding:var(--space-2) var(--space-4); border:1px solid var(--border-subtle); border-radius:var(--radius-full); background:var(--surface-1); color:var(--text-secondary); font:500 var(--text-sm) var(--font-sans); cursor:pointer; }
  .categories button.chosen { border-color:color-mix(in srgb, var(--accent) 50%, var(--border-default)); background:color-mix(in srgb, var(--accent) 14%, var(--surface-1)); color:var(--text-strong); }
  .results { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr)); gap:var(--space-4); }
  .card { display:flex; flex-direction:column; min-height:17rem; padding:var(--space-4); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); background:var(--surface-1); }
  .card-top { display:flex; align-items:start; justify-content:space-between; min-height:3.25rem; }
  .bot-icon { display:grid; place-items:center; width:3rem; height:3rem; border-radius:var(--radius-lg); background:color-mix(in srgb, var(--bot-color) 25%, var(--surface-3)); font-size:1.5rem; }
  .tag { padding:var(--space-1) var(--space-2); border-radius:var(--radius-full); background:color-mix(in srgb, var(--accent) 13%, var(--surface-1)); color:var(--accent); font:700 var(--text-xs) var(--font-sans); }
  .bot-title { display:flex; align-items:center; gap:var(--space-2); margin-top:var(--space-4); }
  .bot-title h3 { margin:0; color:var(--text-strong); font:700 var(--text-md) var(--font-sans); }
  .verified { color:var(--accent); font-size:.9rem; }
  .creator { margin:var(--space-1) 0 0; color:var(--text-muted); font:var(--text-xs) var(--font-sans); }
  .description { min-height:3.5rem; margin:var(--space-3) 0; color:var(--text-secondary); font:var(--text-sm)/1.5 var(--font-sans); }
  .card-bottom { display:flex; align-items:center; justify-content:space-between; margin-top:auto; padding-top:var(--space-3); border-top:1px solid var(--border-subtle); }
  .category-label { color:var(--text-secondary); font:500 var(--text-xs) var(--font-sans); }
  .servers { display:flex; align-items:center; gap:var(--space-1); color:var(--text-muted); font:var(--text-xs) var(--font-sans); }
  .add { min-height:2.25rem; margin-top:var(--space-3); border:1px solid var(--border-default); border-radius:var(--radius-md); background:var(--surface-3); color:var(--text-strong); font:600 var(--text-sm) var(--font-sans); cursor:default; }
  .empty { grid-column:1/-1; display:flex; align-items:center; justify-content:center; gap:var(--space-3); min-height:10rem; color:var(--text-secondary); }
  .narrow-only,.menu { display:none; }
  @media (max-width:700px) {
    .header { gap:var(--space-3); padding:0 var(--space-3); }
    .subtitle,.divider,.heading-icon { display:none; }
    .narrow-only { display:contents; }
    .menu { display:block; border:0; background:none; color:var(--text-secondary); font-size:1.25rem; }
    .content { padding:var(--space-4); }
    .intro { min-height:10rem; padding:var(--space-4); }
    .intro-art { right:-1.5rem; opacity:.35; }
    .intro-copy { max-width:75%; }
    .intro p { font-size:var(--text-sm); }
    .browse-head { align-items:stretch; flex-direction:column; }
    .search { width:100%; }
  }
</style>
