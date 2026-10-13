<script lang="ts">
  import { Menu } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { contextMenu } from '$lib/view/contextmenu.svelte.ts';
</script>

<Menu open={!!contextMenu.current} onclose={() => contextMenu.close()} items={contextMenu.current?.items ?? []} at={contextMenu.current?.at ?? null} label={m.people.menu} />
