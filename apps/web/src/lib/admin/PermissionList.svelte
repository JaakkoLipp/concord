<script lang="ts">
  /**
   * The grouped permission editor (m2c-plan.md): each permission allow, inherit or deny, or on and off for
   * Everyone's plain list. Permissions you don't hold are disabled, since Stoat refuses to grant them.
   */
  import { Permission } from '@concord/domain';
  import { Toggle } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { groupsFor, isDangerous, setTri, triOf, type PermissionContext, type PermissionKey, type Tri } from './permissions.ts';

  interface Props {
    context: PermissionContext;
    /** An override, or Everyone's server permissions as `{ allow: bits, deny: 0n }` with `plain`. */
    value: { allow: bigint; deny: bigint };
    /** On and off only: Everyone's server-wide permissions. */
    plain?: boolean;
    /** The permissions this account holds. */
    mine: bigint;
    readonly?: boolean;
    /** Permissions that can't be turned on here, such as the dangerous ones for Everyone (m4.7-plan.md task 11). */
    forbid?: bigint;
    onchange: (next: { allow: bigint; deny: bigint }) => void;
  }
  let { context, value, plain = false, mine, readonly = false, forbid = 0n, onchange }: Props = $props();
  const uid = $props.id();
  const STATES: Tri[] = ['deny', 'neutral', 'allow'];
  const held = (k: PermissionKey) => (mine & Permission[k]) === Permission[k];
</script>

<div class="list">
  {#each groupsFor(context) as group (group.id)}
    <section>
      <h3>{m.admin.permissionGroups[group.id]}</h3>
      {#each group.keys as key (key)}
        {@const bit = Permission[key]}
        {@const forbidden = (forbid & bit) === bit && (value.allow & bit) !== bit}
        {@const disabled = readonly || !held(key) || forbidden}
        {@const [name, help] = m.admin.permissionNames[key]}
        {@const danger = isDangerous(key) ? m.admin.roles.dangers[key as keyof typeof m.admin.roles.dangers] : null}
        <div class="row" class:disabled data-permission={key}>
          <div class="text">
            <span class="name" id="{uid}-{key}">{name}{#if danger}<span class="danger-mark">{m.admin.roles.dangerous}</span>{/if}</span>
            <span class="help">{forbidden ? m.admin.roles.notForEveryone : disabled && !readonly ? m.admin.roles.notHeld : help}</span>
            {#if danger && !forbidden}<span class="help danger-help">{danger}</span>{/if}
          </div>
          {#if plain}
            <Toggle aria-labelledby="{uid}-{key}" checked={(value.allow & bit) === bit} {disabled}
              onchange={(on) => onchange({ allow: on ? value.allow | bit : value.allow & ~bit, deny: 0n })} />
          {:else}
            <div class="tri" role="radiogroup" aria-labelledby="{uid}-{key}">
              {#each STATES as state (state)}
                <button type="button" role="radio" class={state} aria-checked={triOf(value, bit) === state} aria-label={m.admin.roles[state]} title={m.admin.roles[state]} {disabled}
                  onclick={() => onchange(setTri(value, bit, state))}>{state === 'allow' ? '✓' : state === 'deny' ? '✕' : '/'}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </section>
  {/each}
</div>

<style>
  .list { display: grid; gap: var(--space-6); }
  section { display: grid; gap: var(--space-1); }
  h3 { margin: 0 0 var(--space-2); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .row { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border-subtle); }
  .text { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .name { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .help { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .danger-mark { margin-left: var(--space-3); padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--danger-fill); color: var(--on-danger); font: 700 var(--text-xs) var(--font-sans); vertical-align: middle; }
  .danger-help { color: var(--danger); }
  .disabled .name { color: var(--text-muted); }
  .tri { display: flex; border: 1px solid var(--border-control); border-radius: var(--radius-md); overflow: hidden; flex: none; }
  .tri button { width: 2.25rem; height: 2rem; border: 0; background: var(--surface-1); color: var(--text-secondary); font: 700 var(--text-md) var(--font-sans); cursor: pointer; }
  .tri button + button { border-left: 1px solid var(--border-control); }
  .tri button:disabled { cursor: not-allowed; opacity: 0.5; }
  .tri button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .tri .allow[aria-checked='true'] { background: var(--status-online); color: var(--on-accent); }
  .tri .deny[aria-checked='true'] { background: var(--danger-fill); color: var(--on-danger); }
  .tri .neutral[aria-checked='true'] { background: var(--surface-5); color: var(--text-strong); }
</style>
