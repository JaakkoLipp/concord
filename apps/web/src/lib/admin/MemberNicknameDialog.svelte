<script lang="ts">
  import { Button, Dialog, TextField } from '@concord/ui';
  import { memberKey, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { adminDialogs } from './dialogs.svelte.ts';
  import { nicknameItem } from './members.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const d = $derived(adminDialogs.current?.kind === 'nickname' ? adminDialogs.current : null);
  const member = $derived(d ? store.members.get(memberKey(d.server, d.user)) : undefined);
  const name = $derived(d ? store.displayName(d.user, d.server) : '');
  let nickname = $state('');
  let busy = $state(false);
  let filledFor: unknown = null;

  $effect(() => {
    if (d === filledFor) return;
    filledFor = d;
    nickname = member?.nickname ?? '';
  });

  async function save() {
    const target = d;
    if (!target || busy) return;
    busy = true;
    try {
      if (!nicknameItem(session, target.server, target.user)) throw new Error('Nickname permission changed.');
      const value = nickname.trim();
      await session.admin.editMember(target.server, target.user, value ? { nickname: value } : { remove: ['Nickname'] });
      adminDialogs.done(target);
    } catch {
      toasts.show(m.admin.member.nicknameFailed);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog open={!!d && !!member} title={d ? m.admin.member.nicknameTitle(name) : ''} onclose={() => adminDialogs.close()}>
  <form id="member-nickname" onsubmit={(event) => { event.preventDefault(); void save(); }}>
    <TextField label={m.admin.member.nicknameLabel} bind:value={nickname} maxlength={32} />
  </form>
  {#snippet actions()}
    <Button variant="ghost" onclick={() => adminDialogs.close()}>{m.admin.cancel}</Button>
    <Button type="submit" form="member-nickname" {busy}>{m.admin.save}</Button>
  {/snippet}
</Dialog>
