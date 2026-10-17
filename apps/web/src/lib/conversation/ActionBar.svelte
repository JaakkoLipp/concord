<script lang="ts">
  /**
   * The hover action bar on a message (client.md section 6.1, motion spec 4.2): the top three quick reactions, a
   * divider, add reaction, edit on one's own message or reply on others', and a menu with the rest.
   */
  import { IconButton, Popover, tooltip } from '@concord/ui';
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
  import type { QuickEmoji } from './menu.ts';

  interface Props {
    canReact: boolean; onreact: (anchor: HTMLElement) => void;
    /** M4.5's use-ranked quick reactions: the bar shows the first three. */
    quick: QuickEmoji[]; onquick: (key: string) => void;
    canEdit: boolean; canDelete: boolean; canPin: boolean; canReply: boolean; pinned: boolean;
    onreply: () => void; onedit: () => void; ondelete: (skipConfirm: boolean) => void; onpin: () => void;
    oncopylink: () => void; oncopyid: () => void; onmenu: (open: boolean) => void;
  }
  let { canReact, onreact, quick, onquick, canEdit, canDelete, canPin, canReply, pinned, onreply, onedit, ondelete, onpin, oncopylink, oncopyid, onmenu }: Props = $props();
  let more = $state<HTMLElement | null>(null);
  let open = $state(false);
  const setOpen = (v: boolean) => { open = v; onmenu(v); };
  const run = (f: () => void) => () => { setOpen(false); f(); };
</script>

<div class="bar" role="toolbar" aria-label={m.actions.label}>
  {#if canReact}
    {#each quick.slice(0, 3) as q (q.key)}
      <button class="quick" aria-label={m.actions.reactWith(q.label)} use:tooltip={q.label} onclick={() => onquick(q.key)}>
        {#if q.image}<img src={q.image} alt="" draggable="false" />{:else}{q.text ?? q.label}{/if}
      </button>
    {/each}
    {#if quick.length}<span class="divider" aria-hidden="true"></span>{/if}
    <IconButton size="sm" label={m.actions.react} onclick={(e: MouseEvent) => onreact(e.currentTarget as HTMLElement)}><SmilePlus size={18} /></IconButton>
  {/if}
  <!-- Reply stays in the menus on one's own messages, where Edit takes its place. -->
  {#if canEdit}<IconButton size="sm" label={m.actions.edit} onclick={onedit}><Pencil size={18} /></IconButton>
  {:else if canReply}<IconButton size="sm" label={m.actions.reply} onclick={onreply}><Reply size={18} /></IconButton>{/if}
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
  /* A floating surface, 32 px tall (motion spec 4.2). */
  .bar {
    display: flex; align-items: center; gap: var(--space-1); min-height: 2rem; padding: 0 var(--space-1);
    border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-1); box-shadow: var(--shadow-popover);
  }
  .quick { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; padding: 0; border: 0; border-radius: var(--radius-md); background: none; font-size: var(--icon-sm); cursor: pointer; }
  @media (hover: hover) { .quick:hover { background: var(--hover-overlay); } }
  .quick img { width: 1.125rem; height: 1.125rem; }
  .divider { width: 1px; height: var(--icon-md); margin: 0 var(--space-1); background: var(--border-default); }
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
