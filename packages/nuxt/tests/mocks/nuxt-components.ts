/**
 * Mock Nuxt components for testing
 */
import { defineComponent, h } from "vue";

export const NuxtLink = defineComponent({
  name: "NuxtLink",
  props: {
    to: {
      type: [String, Object],
      required: true,
    },
    href: [String, Object],
    target: String,
    rel: String,
    noRel: Boolean,
    prefetch: Boolean,
    noPrefetch: Boolean,
    activeClass: String,
    exactActiveClass: String,
    prefetchedClass: String,
    replace: Boolean,
    ariaCurrentValue: String,
    external: Boolean,
  },
  setup(props, { slots }) {
    return () =>
      h(
        "a",
        {
          href: typeof props.to === "string" ? props.to : (props.to as any)?.path || "/",
          target: props.target,
          rel: props.rel,
        },
        slots.default?.(),
      );
  },
});
