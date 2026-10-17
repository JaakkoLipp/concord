<script lang="ts">
  /** A reload or link at a user settings URL: settings opens over the last channel (modal.svelte.ts). */
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import { reopen, userSection } from '$lib/settings/modal.svelte.ts';

  let done = false;
  $effect(() => {
    if (!done && app.session) done = reopen(app.session.store, { kind: 'user', section: userSection(page.params.section) });
  });
</script>
