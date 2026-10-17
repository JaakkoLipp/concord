<script lang="ts">
  /** A reload or link at a channel settings URL: settings opens over a channel of its server (modal.svelte.ts). */
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import { reopen } from '$lib/settings/modal.svelte.ts';

  let done = false;
  $effect(() => {
    if (!done && app.session) done = reopen(app.session.store, { kind: 'channel', channel: page.params.channel!, section: page.params.section! });
  });
</script>
