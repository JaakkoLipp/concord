<script lang="ts">
  /**
   * User settings at /app/settings/<section> (m2b-plan.md task 7): the profile editor and Log out, in the
   * shared settings frame.
   */
  import { resolve } from '$app/paths';
  import { Button } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import ProfileEditor from './ProfileEditor.svelte';
  import NotificationsSection from '$lib/notify/NotificationsSection.svelte';
  import SettingsFrame from './SettingsFrame.svelte';

  type Section = 'profile' | 'notifications';
  let { session, section }: { session: Session; section: Section } = $props();
  const SECTIONS: Section[] = ['profile', 'notifications'];
  const items = $derived(SECTIONS.map((s) => ({ id: s, label: m.settings.sections[s], href: resolve('/(app)/app/settings/[section]', { section: s }) })));
</script>

<SettingsFrame title={m.settings.title} {items} active={section} heading={m.settings.sections[section]}>
  {#if section === 'profile'}<ProfileEditor {session} />{/if}
  {#if section === 'notifications'}<NotificationsSection />{/if}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => app.signOut()}>{m.session.logout}</Button>
  {/snippet}
</SettingsFrame>
