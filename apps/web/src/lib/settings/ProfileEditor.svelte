<script lang="ts">
  /**
   * Profile editing with a live preview (m2b-plan.md task 7, client.md section 7). Everything is saved in one
   * PATCH /users/@me through the session's queue, with removals for cleared fields.
   */
  import { untrack } from 'svelte';
  import { guardUnsaved } from '$lib/admin/unsaved.ts';
  import { Button, TextField } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import type { SelfEdit, SelfField, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import ProfileCard from '$lib/people/ProfileCard.svelte';
  import SaveBar from '$lib/admin/SaveBar.svelte';
  import { avatarUrl } from '$lib/view/users.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const self = $derived(store.self!);
  const profile = $derived(store.profiles.get(self.id));
  const chars = (s: string) => [...s].length;

  interface Draft { displayName: string; pronouns: string; bio: string; statusText: string }
  /** A new image, a removal, or no change. */
  type Image = { file: File; url: string } | 'remove' | null;
  const saved = (): Draft => ({ displayName: self.displayName ?? '', pronouns: self.pronouns ?? '', bio: profile?.content ?? '', statusText: self.statusText ?? '' });
  let draft = $state<Draft>({ displayName: '', pronouns: '', bio: '', statusText: '' });
  let avatar = $state<Image>(null);
  let banner = $state<Image>(null);
  let saving = $state(false);
  let imageError = $state<string | undefined>();
  let loaded = $state(false);

  // Once per account. untrack: loadProfile reads the store, and its own result must not start it again.
  const selfId = $derived(self.id);
  $effect(() => {
    const id = selfId;
    untrack(() => void session.loadProfile(id, true).finally(() => { draft = saved(); loaded = true; }));
  });

  const errors = $derived({
    displayName: draft.displayName && (chars(draft.displayName.trim()) < 2 || chars(draft.displayName.trim()) > 32 || /[​\n\r]/.test(draft.displayName)) ? m.settings.profile.errors.displayName : undefined,
    pronouns: chars(draft.pronouns.trim()) > 24 ? m.settings.profile.errors.pronouns : undefined,
    bio: chars(draft.bio) > 2000 ? m.settings.profile.errors.bio : undefined,
    statusText: chars(draft.statusText.trim()) > 128 ? m.settings.profile.errors.status : undefined,
  });
  const valid = $derived(!Object.values(errors).some(Boolean));
  const original = $derived(loaded ? saved() : draft);
  const dirty = $derived(loaded && (avatar !== null || banner !== null
    || draft.displayName.trim() !== original.displayName || draft.pronouns.trim() !== original.pronouns
    || draft.bio !== original.bio || draft.statusText.trim() !== original.statusText));

  const preview = $derived({
    displayName: draft.displayName.trim(),
    pronouns: draft.pronouns.trim(),
    avatar: avatar === 'remove' ? `/api/users/${self.id}/default_avatar` : avatar ? avatar.url : avatarUrl(self),
    banner: banner === 'remove' ? null : banner ? banner.url : profile?.background ? fileUrl(profile.background, { maxSide: 1024 }) : null,
    bio: draft.bio,
    statusText: draft.statusText.trim(),
  });

  function choose(kind: 'avatar' | 'banner', e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const limit = store.node?.uploadLimits[kind === 'avatar' ? 'avatars' : 'backgrounds'] ?? (kind === 'avatar' ? 4_000_000 : 6_000_000);
    if (!file.type.startsWith('image/')) { imageError = m.settings.profile.errors.imageOnly; return; }
    if (file.size > limit) { imageError = m.settings.profile.errors.tooLarge(Math.round(limit / 100_000) / 10); return; }
    imageError = undefined;
    const next = { file, url: URL.createObjectURL(file) };
    if (kind === 'avatar') { release(avatar); avatar = next; } else { release(banner); banner = next; }
  }
  const release = (i: Image) => { if (i && i !== 'remove') URL.revokeObjectURL(i.url); };
  $effect(() => () => { release(avatar); release(banner); });

  function reset() {
    release(avatar);
    release(banner);
    avatar = null;
    banner = null;
    imageError = undefined;
    draft = saved();
  }

  async function save() {
    if (!dirty || !valid || saving) return;
    saving = true;
    try {
      const change: SelfEdit = {};
      const remove: SelfField[] = [];
      const text = (value: string, before: string, field: 'displayName' | 'pronouns' | 'statusText') => {
        const v = value.trim();
        if (v === before) return;
        if (v) change[field] = v;
        else remove.push(field);
      };
      text(draft.displayName, original.displayName, 'displayName');
      text(draft.pronouns, original.pronouns, 'pronouns');
      text(draft.statusText, original.statusText, 'statusText');
      if (draft.bio !== original.bio) {
        if (draft.bio.trim()) change.bio = draft.bio;
        else remove.push('bio');
      }
      if (avatar === 'remove') remove.push('avatar');
      else if (avatar) change.avatar = await session.backend.upload(avatar.file, avatar.file.name, undefined, 'avatars');
      if (banner === 'remove') remove.push('banner');
      else if (banner) change.banner = await session.backend.upload(banner.file, banner.file.name, undefined, 'backgrounds');
      if (remove.length) change.remove = remove;
      await session.editSelf(change);
      release(avatar);
      release(banner);
      avatar = null;
      banner = null;
      draft = saved();
      toasts.show(m.settings.profile.saved, 'info');
    } catch {
      toasts.show(m.settings.profile.failed);
    } finally {
      saving = false;
    }
  }

  // Leaving with unsaved changes asks first. Closing the tab gets the browser's own question.
  guardUnsaved(() => dirty, reset, { title: m.settings.profile.leaveTitle, body: m.settings.profile.leaveBody, confirm: m.settings.profile.leave });
</script>

<div class="editor" id="profile-editor">
  <div class="fields">
    <TextField label={m.settings.profile.displayName} bind:value={draft.displayName} placeholder={self.username} error={errors.displayName} hint={m.settings.profile.displayNameHint} />
    <TextField label={m.settings.profile.pronouns} bind:value={draft.pronouns} error={errors.pronouns} />

    <div class="group">
      <span class="label">{m.settings.profile.avatar}</span>
      <div class="buttons">
        <label class="upload"><input type="file" accept="image/*" onchange={(e) => choose('avatar', e)} />{m.settings.profile.change}</label>
        {#if (avatar && avatar !== 'remove') || (avatar === null && self.avatar)}
          <Button size="sm" variant="ghost" onclick={() => { release(avatar); avatar = 'remove'; }}>{m.settings.profile.remove}</Button>
        {/if}
      </div>
    </div>
    <div class="group">
      <span class="label">{m.settings.profile.banner}</span>
      <div class="buttons">
        <label class="upload"><input type="file" accept="image/*" onchange={(e) => choose('banner', e)} />{m.settings.profile.change}</label>
        {#if (banner && banner !== 'remove') || (banner === null && profile?.background)}
          <Button size="sm" variant="ghost" onclick={() => { release(banner); banner = 'remove'; }}>{m.settings.profile.remove}</Button>
        {/if}
      </div>
    </div>
    {#if imageError}<p class="error" role="alert">{imageError}</p>{/if}

    <TextField label={m.settings.profile.status} bind:value={draft.statusText} error={errors.statusText} />

    <div class="group">
      <label class="label" for="bio">{m.settings.profile.bio}</label>
      <textarea id="bio" rows="6" bind:value={draft.bio} aria-invalid={errors.bio ? true : undefined} aria-describedby="bio-note"></textarea>
      <p class="note" class:error={!!errors.bio} id="bio-note">{errors.bio ?? (chars(draft.bio) > 1800 ? m.settings.profile.left(2000 - chars(draft.bio)) : m.settings.profile.bioHint)}</p>
    </div>
  </div>

  <aside class="preview" aria-label={m.settings.profile.preview}>
    <span class="label">{m.settings.profile.preview}</span>
    <ProfileCard {store} user={self.id} server={undefined} variant="popout" {preview} />
  </aside>
</div>

{#if dirty}
  <SaveBar {saving} {valid} onreset={reset} onsave={save} />
{/if}

<style>
  .editor { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-8); align-items: start; }
  .fields { display: grid; gap: var(--space-6); min-width: 0; }
  .group { display: grid; gap: var(--space-3); }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .buttons { display: flex; gap: var(--space-3); }
  .upload {
    display: inline-flex; align-items: center; min-height: 2rem; padding: 0 var(--space-4); border-radius: var(--radius-md);
    background: var(--accent); color: var(--on-accent); font: 500 var(--text-sm) var(--font-sans); cursor: pointer;
  }
  @media (hover: hover) { .upload:hover { background: var(--accent-hover); } }
  .upload:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  .upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  textarea {
    min-height: 8rem; padding: var(--space-3) var(--space-4); resize: vertical;
    background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md);
  }
  textarea:focus-visible { outline: none; border-color: var(--accent); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
  .preview { display: grid; gap: var(--space-3); position: sticky; top: 0; }
  .preview :global(.card) { border: 1px solid var(--border-default); }
  /* Side by side only with room for the form beside the 400 px card; otherwise the preview goes below the form. */
  @container settings (max-width: 52rem) {
    .editor { grid-template-columns: minmax(0, 1fr); }
    .preview { position: static; }
  }
</style>
