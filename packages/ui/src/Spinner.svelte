<script lang="ts">
  /**
   * The wandering cubes (motion spec 4.14): two squares in `--accent` chasing each other round a 32 px box,
   * half a cycle apart, every 1.8 s. It keeps turning under reduced motion, since it says something is loading.
   */
  let { label }: { label: string } = $props();
</script>

<span class="spinner" role="status" aria-label={label}><span></span><span></span></span>

<style>
  .spinner { position: relative; display: inline-block; flex: none; width: 2rem; height: 2rem; }
  .spinner span {
    position: absolute; top: 0; left: 0; width: 0.625rem; height: 0.625rem; background: var(--accent);
    animation: cubes var(--dur-spinner) var(--ease-spinner) infinite;
  }
  .spinner span:last-child { animation-delay: calc(var(--dur-spinner) / -2); }
  @keyframes cubes {
    25% { transform: translateX(1.375rem) rotate(-90deg) scale(0.5); }
    50% { transform: translateX(1.375rem) translateY(1.375rem) rotate(-180deg); }
    75% { transform: translateX(0) translateY(1.375rem) rotate(-270deg) scale(0.5); }
    100% { transform: rotate(-360deg); }
  }
</style>
