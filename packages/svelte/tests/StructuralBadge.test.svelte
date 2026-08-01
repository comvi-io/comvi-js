<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, variant = 'default' }: { children?: Snippet; variant?: string } = $props();
</script>

<mark data-testid="badge" data-variant={variant}>{@render children?.()}</mark>
