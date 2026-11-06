<script module lang="ts">
  /**
   * The brand of what `<T>` hands over for a tag. A Symbol, so a param (an object from JSON, say)
   * can never pass for one and render as an element.
   */
  const E = Symbol();
  /** Development: (key, tag) pairs whose snippet got markup, warned once each. */
  const warned: Record<string, 1> = Object.create(null);
</script>

<script lang="ts">
  import { core, N } from "@comvi/core/internal";
  import { DEV } from "esm-env";
  import { use } from "./context.svelte.js";

  let { i18nKey, components, ns, ...p }: Record<string, any> = $props();

  const c = use();
  const x = core(c.i);
  /** Rich parts → one value: their text when all are strings. Also the core's joiner. */
  const join = (r: unknown[]) => (r.every((e) => typeof e == "string") ? r.join("") : r);

  const out = $derived.by(() => {
    // Prototype-free: a tag named `constructor` is a param, no inherited member.
    const q: Record<string, any> = N();
    for (const k in p) {
      const v = p[k];
      // A function prop is a snippet (`{#snippet link(children)}` or `link={snippet}`): `<T>` takes
      // no handler. `t`: the tag's text, the core's second argument to a handler that declares one.
      if (typeof v == "function")
        // Its `toString` is the prop's: a plain {x} of the same name prints `String(v)`, as before.
        q[k] = Object.assign((m: unknown, t: unknown) => {
          // The snippet gets text, so the markup of a nested tag is lost.
          if (DEV && typeof m != "string" && !warned[i18nKey + "\0" + k]) {
            warned[i18nKey + "\0" + k] = 1;
            console.warn(
              `[@comvi/svelte] <${k}> in "${i18nKey}" holds markup, but its snippet's \`children\` is the text only. Render <${k}> through \`components\` to keep the markup`,
            );
          }
          // A plain {x} is always text, so the tag's text is a string.
          return { [E]: 1, s: v, c: t as string };
        }, { toString: () => String(v) });
      else if (v !== undefined) q[k] = v;
    }
    for (const k in components) {
      // A tag name, a component, or `{ component, props }` (R3-24), over a snippet of the same
      // name. An entry that is `undefined` leaves the tag to its snippet.
      const e = components[k];
      if (e) q[k] = (m: unknown) => ({ [E]: 1, t: e.component || e, p: e.component && e.props, c: m });
    }
    // `locale` and `markers` are among the params: the core reads them off as per-call options.
    q.ns = ns;
    return x.tr(c.s, i18nKey, q as never, ns, join);
  });
</script>

<!--
  Translation content only ever produces text and elements `components` and snippets chose: there
  is no HTML string sink. An element with no content gets no children: a void one (`<br>`)
  refuses them.
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

{@render list(out)}
