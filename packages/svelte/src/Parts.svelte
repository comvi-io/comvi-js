<script module lang="ts">
  /**
   * The brand of what `<T>` hands over for a tag. A Symbol, so a param (an object from JSON, say)
   * can never pass for one and render as an element.
   */
  export const E = Symbol();
</script>

<script lang="ts">
  let { parts }: { parts: unknown } = $props();
</script>

<!--
  Translation content only ever produces text and elements the handlers chose: there is no HTML
  string sink. An element with no content gets no children: a void one (`<br>`) refuses them.
-->
{#snippet list(r: any)}
  {#each [r].flat(9) as e, i (i)}{@render one(e)}{/each}
{/snippet}

{#snippet one(e: any)}
  {#if !e?.[E]}
    {e}
  {:else if e.s}
    {@render e.s(e.c)}
  {:else if typeof e.t == "string"}
    {#if e.c === ""}
      <svelte:element this={e.t} {...e.p} />
    {:else}
      <svelte:element this={e.t} {...e.p}>{@render list(e.c)}</svelte:element>
    {/if}
  {:else if e.c === ""}
    <e.t {...e.p} />
  {:else}
    <e.t {...e.p}>{@render list(e.c)}</e.t>
  {/if}
{/snippet}

{@render list(parts)}
