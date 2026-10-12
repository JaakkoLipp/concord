<script lang="ts">
  import { m } from '$lib/i18n/index.ts';
</script>

<div class="empty">
  <h1>{m.shell.friends}</h1>
  <p>{m.shell.friendsLater}</p>
</div>

<style>
  .empty { display: grid; place-content: center; gap: var(--space-3); height: 100%; text-align: center; color: var(--text-secondary); }
  h1 { margin: 0; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  p { margin: 0; }
</style>
