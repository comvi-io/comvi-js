import { defineComponent, h, computed, type PropType } from "vue";
import { NuxtLink } from "#components";
import { useLocalePath } from "../composables/useLocalePath";

/**
 * Prefixes the `to` prop with the current or specified locale, following the
 * localePrefix configuration. All other NuxtLink props are forwarded via
 * $attrs.
 *
 * @example
 * ```vue
 * <NuxtLinkLocale to="/about">About</NuxtLinkLocale>
 * <NuxtLinkLocale to="/about" locale="de">Über uns</NuxtLinkLocale>
 * ```
 */
export default defineComponent({
  name: "NuxtLinkLocale",

  // Forwarded manually below, with `to` overridden.
  inheritAttrs: false,

  props: {
    /** Locale-prefixed before it reaches NuxtLink. */
    to: {
      type: [String, Object] as PropType<string | Record<string, unknown>>,
      required: true,
    },

    /** Defaults to the current locale. */
    locale: {
      type: String,
      default: undefined,
    },
  },

  setup(props, { slots, attrs }) {
    const localePath = useLocalePath();

    const localizedTo = computed(() => {
      return localePath(props.to, props.locale);
    });

    return () => {
      return h(NuxtLink, { ...attrs, to: localizedTo.value }, slots);
    };
  },
});
