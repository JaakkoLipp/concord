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
  import { titleFor, unreadTotal } from '$lib/shell/title.ts';

  let { children }: { children: Snippet } = $props();
  const onLogin = $derived(page.url.pathname.startsWith('/app/login'));
  // An invite shows its preview signed out, so a new member sees where it leads before logging in.
  const onInvite = $derived(page.url.pathname.startsWith('/app/invite/'));
  // A welcome link sets a password before there is any session (m3-plan.md task 2).
  const onWelcome = $derived(page.url.pathname.startsWith('/app/welcome/'));

  /** Where login returns to: only a path inside the app, never the login page or another origin. */
  function next(url: URL): string | null {
    const n = url.searchParams.get('next');
    return n && /^\/app\/(?!\/|login)/.test(n) ? n : null;
  }

  $effect(() => {
    void app.restore();
  });

  // Mentions and DMs waiting, in the tab's title.
  $effect(() => {
    document.title = titleFor(app.session ? unreadTotal(app.session.store) : 0);
  });

  $effect(() => {
    if (app.status === 'signed-out' && !onLogin && !onInvite && !onWelcome) {
      const here = page.url.pathname + page.url.search;
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query string
      void goto(`${resolve('/app/login')}${here === '/app' ? '' : `?next=${encodeURIComponent(here)}`}`, { replaceState: true });
    }
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- next() admits only paths under /app/
    if (app.status === 'signed-in' && onLogin) void goto(next(page.url) ?? resolve('/app'), { replaceState: true });
  });
</script>

<!-- Admin saves can wait a while for Stoat's rate limit: closing the tab meanwhile would lose them. -->
<svelte:window onbeforeunload={(e) => { if (app.session?.admin.pending) e.preventDefault(); }} />

{#if onLogin || onInvite || onWelcome || app.status === 'signed-in'}
  {@render children()}
{:else}
  <div class="splash" aria-live="polite">{m.app.loading}</div>
{/if}

<style>
  .splash { display: grid; place-items: center; height: 100dvh; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
