<script lang="ts">
  import { Button, Dialog, TextField, Avatar } from '@concord/ui';
  import { Permission, has, memberKey, type MemberEdit, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { serverPerms } from '$lib/view/admin.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { adminDialogs } from './dialogs.svelte.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const d = $derived(adminDialogs.current?.kind === 'serverProfile' ? adminDialogs.current : null);
  const server = $derived(d ? store.servers.get(d.server) : undefined);
  const self = $derived(store.self);
  const member = $derived(d && self ? store.members.get(memberKey(d.server, self.id)) : undefined);
  const perms = $derived(d ? serverPerms(store, d.server) : 0n);
  const canNickname = $derived(has(perms, Permission.ChangeNickname));
  const canAvatar = $derived(has(perms, Permission.ChangeAvatar));
  type Image = { file: File; url: string } | 'remove' | null;
  let nickname = $state('');
  let avatar = $state<Image>(null);
  let imageError = $state<string | undefined>();
  let busy = $state(false);
  let filledFor: unknown = null;
  $effect(() => {
    if (d === filledFor) return;
    filledFor = d;
    nickname = member?.nickname ?? '';
    release(avatar);
    avatar = null;
    imageError = undefined;
  });
  const originalNickname = $derived(member?.nickname ?? '');
  const nicknameError = $derived(canNickname && nickname.trim() && ([...nickname.trim()].length > 32 || /[\n\r\u200b]/.test(nickname)) ? m.admin.serverProfile.invalidNickname : undefined);
  const changed = $derived((canNickname && nickname.trim() !== originalNickname) || (canAvatar && avatar !== null));
  const avatarSrc = $derived(avatar === 'remove' ? (self ? avatarUrl(self) : '') : avatar && avatar !== null ? avatar.url : self ? avatarUrl(self, member?.avatar) : '');

  function release(value: Image) { if (value && value !== 'remove') URL.revokeObjectURL(value.url); }
  function choose(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const limit = store.node?.uploadLimits.avatars ?? 4_000_000;
    if (!file.type.startsWith('image/')) { imageError = m.settings.profile.errors.imageOnly; return; }
    if (file.size > limit) { imageError = m.settings.profile.errors.tooLarge(Math.round(limit / 100_000) / 10); return; }
    imageError = undefined;
    const next = { file, url: URL.createObjectURL(file) };
    release(avatar);
    avatar = next;
  }
  $effect(() => () => release(avatar));

  async function save() {
    const current = d;
    if (!current || !member || !self || busy || nicknameError || !changed) return;
    busy = true;
    try {
      const edit: MemberEdit = {};
      const remove: ('Nickname' | 'Avatar')[] = [];
      if (canNickname && nickname.trim() !== originalNickname) {
        if (nickname.trim()) edit.nickname = nickname.trim();
        else remove.push('Nickname');
      }
      if (canAvatar) {
        if (avatar === 'remove') remove.push('Avatar');
        else if (avatar) edit.avatar = await session.backend.upload(avatar.file, avatar.file.name, undefined, 'avatars');
      }
      if (remove.length) edit.remove = remove;
      await session.admin.editMember(current.server, self.id, edit);
      release(avatar);
      avatar = null;
      adminDialogs.done(current);
      toasts.show(m.admin.serverProfile.saved, 'info');
    } catch {
      toasts.show(m.admin.serverProfile.failed);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog open={!!d && !!member && (canNickname || canAvatar)} title={m.admin.serverProfile.title(server?.name ?? '')} onclose={() => adminDialogs.close()}>
  {#if canNickname}<TextField label={m.admin.serverProfile.nickname} bind:value={nickname} error={nicknameError} />{/if}
  {#if canAvatar}
    <div class="avatar-field">
      <span class="label">{m.admin.serverProfile.avatar}</span>
      <div class="avatar-row">
        <Avatar src={avatarSrc} size={48} />
        <label class="upload"><input type="file" accept="image/*" onchange={choose} />{m.admin.serverProfile.change}</label>
        {#if avatar !== 'remove' && (member?.avatar || avatar)}
          <Button size="sm" variant="ghost" onclick={() => { release(avatar); avatar = member?.avatar ? 'remove' : null; }}>{m.admin.serverProfile.remove}</Button>
        {/if}
      </div>
      {#if imageError}<p class="error" role="alert">{imageError}</p>{/if}
    </div>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={() => adminDialogs.close()}>{m.admin.cancel}</Button>
    <Button {busy} disabled={!changed || !!nicknameError} onclick={save}>{m.admin.serverProfile.save}</Button>
  {/snippet}
</Dialog>

<style>
  .avatar-field { display: grid; gap: var(--space-2); }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); text-transform: uppercase; }
  .avatar-row { display: flex; align-items: center; gap: var(--space-3); }
  .upload { color: var(--accent); cursor: pointer; font: 500 var(--text-sm) var(--font-sans); }
  .upload input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
