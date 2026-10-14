<script lang="ts">
  import '@concord/ui/tokens.css';
  import '@concord/ui/base.css';
  import '@fontsource-variable/figtree/wght.css';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import { m } from '$lib/i18n/index.ts';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  const onLogin = $derived(page.url.pathname.startsWith('/app/login'));

  $effect(() => {
    void app.restore();
  });

  $effect(() => {
    if (app.status === 'signed-out' && !onLogin) void goto(resolve('/app/login'), { replaceState: true });
    if (app.status === 'signed-in' && onLogin) void goto(resolve('/app'), { replaceState: true });
  });
</script>

<!-- Admin saves can wait a while for Stoat's rate limit: closing the tab meanwhile would lose them. -->
<svelte:window onbeforeunload={(e) => { if (app.session?.admin.pending) e.preventDefault(); }} />

{#if onLogin || app.status === 'signed-in'}
  {@render children()}
{:else}
  <div class="splash" aria-live="polite">{m.app.loading}</div>
{/if}

<style>
  .splash { display: grid; place-items: center; height: 100dvh; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
