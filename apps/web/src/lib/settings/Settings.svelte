<script lang="ts">
  /**
   * User settings at /app/settings/<section> (m2b-plan.md task 7): my account (M4.8 task 8), the profile editor,
   * notifications, voice and video, and Log out, in the shared settings frame. A new section is a name in USER_SECTIONS and a branch here.
   */
  import { Button } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import ProfileEditor from './ProfileEditor.svelte';
  import NotificationsSection from '$lib/notify/NotificationsSection.svelte';
  import SettingsFrame from './SettingsFrame.svelte';
  import VoiceSection from './VoiceSection.svelte';
  import TagChooser from './TagChooser.svelte';
  import AccountSection from './AccountSection.svelte';
  import { USER_SECTIONS, type UserSection } from './modal.svelte.ts';

  let { session, section }: { session: Session; section: UserSection } = $props();
  const items = $derived(USER_SECTIONS.map((s) => ({ id: s, label: m.settings.sections[s], target: { kind: 'user' as const, section: s } })));
</script>

<SettingsFrame title={m.settings.title} {items} active={section} heading={m.settings.sections[section]} wide={section === 'profile'}>
  {#if section === 'account'}<AccountSection {session} />{/if}
  {#if section === 'profile'}<ProfileEditor {session} /><TagChooser {session} />{/if}
  {#if section === 'notifications'}<NotificationsSection />{/if}
  {#if section === 'voice'}<VoiceSection />{/if}
  {#snippet footer()}
    {@const gates = app.layerMe?.gates}
    {#if gates?.serverCreator || gates?.admin}
      <p class="gates">{[gates.serverCreator && m.settings.gates.serverCreator, gates.admin && m.settings.gates.admin].filter(Boolean).join(' · ')}</p>
    {/if}
    <Button variant="ghost" size="sm" onclick={() => app.signOut()}>{m.session.logout}</Button>
  {/snippet}
</SettingsFrame>

<style>
  /* Our own gates, from the layer (architecture section 11), read-only. */
  .gates { margin: 0 0 var(--space-2); padding: 0 var(--space-3); color: var(--text-muted); font: 500 var(--text-xs) var(--font-sans); }
</style>
