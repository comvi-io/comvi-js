<script module lang="ts">
  /** Development: (key, tag) pairs whose snippet got markup, warned once each. */
  const warned: Record<string, 1> = Object.create(null);
</script>

<script lang="ts">
  // No `{@render}` here: Svelte refuses it beside `$$slots`, the only way to tell a snippet
  // of a tag's name from a handler attribute. Parts.svelte renders.
  import { core, N } from "@comvi/core/internal";
  import { DEV } from "esm-env";
  import { use } from "./context.svelte.js";
  import Parts, { E } from "./Parts.svelte";

  let { i18nKey, components, ns, ...p }: Record<string, any> = $props();

  const c = use();
  const x = core(c.i);
  const slots = $$slots as Record<string, boolean>;
  /** Rich parts → one value: their text when all are strings. Also the core's joiner. */
  const join = (r: unknown[]) => (r.every((e) => typeof e == "string") ? r.join("") : r);

  const out = $derived.by(() => {
    // Prototype-free: a tag named `constructor` is a handler, no inherited member.
    const q: Record<string, any> = N();
    for (const k in p)
      if (slots[k])
        // `t`: the tag's text from the message with no handler run, the core's second
        // argument to a handler that declares one.
        q[k] = (m: unknown, t: unknown) => {
          // The snippet gets text, so the markup of a nested tag is lost.
          if (DEV && typeof m != "string" && !warned[i18nKey + "\0" + k]) {
            warned[i18nKey + "\0" + k] = 1;
            console.warn(
              `[@comvi/svelte] <${k}> in "${i18nKey}" holds markup, but its snippet's \`children\` is the text only. Render <${k}> through \`components\` to keep the markup`,
            );
          }
          return {
            [E]: 1,
            s: p[k],
            c: ([] as unknown[])
              .concat(t)
              .filter((e) => typeof e == "string")
              .join(""),
          };
        };
    for (const k in components) {
      // A tag name, a component, or `{ component, props }` (R3-24). An entry that is
      // `undefined` leaves the tag to its snippet.
      const e = components[k];
      if (e) q[k] = (m: unknown) => ({ [E]: 1, t: e.component || e, p: e.component && e.props, c: m });
    }
    for (const k in p) if (!slots[k] && p[k] !== undefined) q[k] = p[k];
    // `locale` and `markers` are among the params: the core reads them off as per-call options.
    q.ns = ns;
    return x.tr(c.s, i18nKey, q as never, ns, join);
  });
</script>

<Parts parts={out} />
