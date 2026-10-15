<script lang="ts">
  /**
   * Concord's mark: the white logo's shape as a mask, so it takes the current text colour, such as the accent's
   * label colour on the rail's hovered home button. Decorative unless given a label.
   */
  let { size = 'var(--icon-lg)', label }: { size?: string; label?: string } = $props();
</script>

<span class="logo" style:--size={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}></span>

<style>
  .logo {
    display: inline-block; width: var(--size); height: var(--size); flex: none; background: currentColor;
    mask: url('/app/brand/logo.png') center / contain no-repeat;
  }
</style>
