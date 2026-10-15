<script lang="ts">
  /** The hover action bar on a message (client.md section 6.1): reply, edit if own, and a menu with the rest. */
  import { IconButton, Popover } from '@concord/ui';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Hash from '@lucide/svelte/icons/hash';
  import Link from '@lucide/svelte/icons/link';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Pin from '@lucide/svelte/icons/pin';
  import PinOff from '@lucide/svelte/icons/pin-off';
  import Reply from '@lucide/svelte/icons/reply';
  import SmilePlus from '@lucide/svelte/icons/smile-plus';
  import Trash from '@lucide/svelte/icons/trash-2';
  import { m } from '$lib/i18n/index.ts';

  interface Props {
    canReact: boolean; onreact: (anchor: HTMLElement) => void;
    canEdit: boolean; canDelete: boolean; canPin: boolean; canReply: boolean; pinned: boolean;
    onreply: () => void; onedit: () => void; ondelete: (skipConfirm: boolean) => void; onpin: () => void;
    oncopylink: () => void; oncopyid: () => void; onmenu: (open: boolean) => void;
  }
  let { canReact, onreact, canEdit, canDelete, canPin, canReply, pinned, onreply, onedit, ondelete, onpin, oncopylink, oncopyid, onmenu }: Props = $props();
  let more = $state<HTMLElement | null>(null);
  let open = $state(false);
  const setOpen = (v: boolean) => { open = v; onmenu(v); };
  const run = (f: () => void) => () => { setOpen(false); f(); };
</script>

<div class="bar" role="toolbar" aria-label={m.actions.label}>
  {#if canReact}<IconButton size="sm" label={m.actions.react} onclick={(e: MouseEvent) => onreact(e.currentTarget as HTMLElement)}><SmilePlus size={18} /></IconButton>{/if}
  {#if canReply}<IconButton size="sm" label={m.actions.reply} onclick={onreply}><Reply size={18} /></IconButton>{/if}
  {#if canEdit}<IconButton size="sm" label={m.actions.edit} onclick={onedit}><Pencil size={18} /></IconButton>{/if}
  <span bind:this={more}><IconButton size="sm" label={m.actions.more} active={open} aria-haspopup="menu" aria-expanded={open} onclick={() => setOpen(!open)}><Ellipsis size={18} /></IconButton></span>
</div>
<Popover anchor={more} {open} onclose={() => setOpen(false)} side="left" label={m.actions.more}>
  <div class="menu" role="menu">
    {#if canPin}
      <button role="menuitem" onclick={run(onpin)}>{pinned ? m.actions.unpin : m.actions.pin}{#if pinned}<PinOff size={16} />{:else}<Pin size={16} />{/if}</button>
    {/if}
    <button role="menuitem" onclick={run(oncopylink)}>{m.actions.copyLink}<Link size={16} /></button>
    <button role="menuitem" onclick={run(oncopyid)}>{m.actions.copyId}<Hash size={16} /></button>
    {#if canDelete}
      <button role="menuitem" class="danger" onclick={(e) => { const skip = e.shiftKey; setOpen(false); ondelete(skip); }}>{m.actions.delete}<Trash size={16} /></button>
    {/if}
  </div>
</Popover>

<style>
  .bar {
    display: flex; gap: var(--space-1); padding: var(--space-1); border: 1px solid var(--border-default); border-radius: var(--radius-md);
    background: var(--surface-2); box-shadow: var(--shadow-popover);
  }
  .menu { display: flex; flex-direction: column; min-width: 12rem; padding: var(--space-2); }
  .menu button {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-2) var(--space-3);
    border: 0; border-radius: var(--radius-xs); background: none; color: var(--text-normal); font: 500 var(--text-sm) var(--font-sans); text-align: left; cursor: pointer;
  }
  .menu button:focus-visible { background: var(--accent); color: var(--on-accent); outline: none; }
  @media (hover: hover) { .menu button:hover { background: var(--accent); color: var(--on-accent); } }
  .menu .danger { color: var(--danger); }
  .menu .danger:focus-visible { background: var(--danger-fill); color: var(--on-danger); }
  @media (hover: hover) { .menu .danger:hover { background: var(--danger-fill); color: var(--on-danger); } }
</style>
