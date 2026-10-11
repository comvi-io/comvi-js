<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, body, children }: { title: string; body?: string; children: Snippet } = $props();
</script>

<section class="card">
  <h2 class="eyebrow">{title}</h2>
  {#if body}<p class="card-body">{body}</p>{/if}
  {@render children()}
</section>
