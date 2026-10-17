<script lang="ts">
  /** A reload or link at a server settings URL: settings opens over a channel of that server (modal.svelte.ts). */
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import { reopen } from '$lib/settings/modal.svelte.ts';

  let done = false;
  $effect(() => {
    if (!done && app.session) done = reopen(app.session.store, { kind: 'server', server: page.params.server!, section: page.params.section! });
  });
</script>
