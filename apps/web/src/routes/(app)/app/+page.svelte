<script lang="ts">
  import { m } from '$lib/i18n/index.ts';

  let version = $state('…');
  $effect(() => {
    fetch('/api/')
      .then((r) => r.json())
      .then((root: { revolt: string }) => (version = root.revolt))
      .catch(() => (version = m.app.unreachable));
  });
</script>

<main>
  <h1>{m.app.name}</h1>
  <p>{m.app.backendVersion(version)}</p>
</main>
