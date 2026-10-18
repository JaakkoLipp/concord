<script lang="ts">
  /**
   * User settings at /app/settings/<section> (m2b-plan.md task 7): my account (M4.8 task 8), the profile editor,
   * appearance (M4.8 task 15), notifications, voice and video, and Log out, in the shared settings frame. A new section is a name in USER_SECTIONS and a branch here.
   */
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import ProfileEditor from './ProfileEditor.svelte';
  import NotificationsSection from '$lib/notify/NotificationsSection.svelte';
  import SettingsFrame from './SettingsFrame.svelte';
  import VoiceSection from './VoiceSection.svelte';
  import TagChooser from './TagChooser.svelte';
  import AccountSection from './AccountSection.svelte';
  import AppearanceSection from './AppearanceSection.svelte';
  import { USER_SECTIONS, settingsModal, type UserSection } from './modal.svelte.ts';
  import type { FrameItem, FrameSection } from './SettingsFrame.svelte';

  let { session, section }: { session: Session; section: UserSection } = $props();
  /** The sidebar's groups (m4.6-plan.md task 17): the account's own pages, then the app's. A new section lands in App settings. */
  const ACCOUNT: readonly UserSection[] = ['account', 'profile'];
  /** Pages whose sections the sidebar lists, by their headings' ids (decision 6). */
  const SECTIONS: Partial<Record<UserSection, () => FrameSection[]>> = {
    profile: () => [{ id: 'profile-editor', label: m.settings.sections.profile }, { id: 'tag-heading', label: m.settings.tag.heading }],
    voice: () => {
      const t = m.settings.voice;
      return [
        { id: 'voice-heading', label: t.voice }, { id: 'input-mode-section', label: t.inputMode }, { id: 'keybinds-heading', label: t.keybinds },
        { id: 'video-heading', label: t.video }, { id: 'share-heading', label: t.screenShare },
      ];
    },
  };
  const items = $derived(USER_SECTIONS.map((s): FrameItem => ({
    id: s, label: m.settings.sections[s], target: { kind: 'user', section: s },
    group: ACCOUNT.includes(s) ? m.settings.title : m.settings.groups.app, sections: SECTIONS[s]?.(),
  })));
</script>

<SettingsFrame title={m.settings.title} {items} active={section} heading={m.settings.sections[section]} wide={section === 'profile'} version={__CONCORD_VERSION__}>
  {#if section === 'account'}<AccountSection {session} />{/if}
  {#if section === 'profile'}<ProfileEditor {session} /><TagChooser {session} />{/if}
  {#if section === 'appearance'}<AppearanceSection />{/if}
  {#if section === 'notifications'}<NotificationsSection />{/if}
  {#if section === 'voice'}<VoiceSection />{/if}
  {#snippet footer()}
    {@const gates = app.layerMe?.gates}
    {#if gates?.serverCreator || gates?.admin}
      <p class="gates">{[gates.serverCreator && m.settings.gates.serverCreator, gates.admin && m.settings.gates.admin].filter(Boolean).join(' · ')}</p>
    {/if}
    <button class="logout" onclick={() => void settingsModal.dismiss().then(() => app.signOut())}>{m.session.logout}</button>
  {/snippet}
</SettingsFrame>

<style>
  /* Our own gates, from the layer (architecture section 11), read-only. */
  /* Red, as Discord's, in the sidebar's item shape. */
  .logout {
    display: flex; align-items: center; min-height: 2.25rem; padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-md);
    background: none; color: var(--danger); text-align: left; font: 500 var(--text-md) var(--font-sans);
  }
  @media (hover: hover) { .logout:hover { background: var(--hover-overlay); } }
  .gates { margin: 0 0 var(--space-2); padding: 0 var(--space-3); color: var(--text-muted); font: 500 var(--text-xs) var(--font-sans); }
</style>
