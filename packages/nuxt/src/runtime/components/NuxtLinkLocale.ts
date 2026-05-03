import { defineComponent, h, computed, type PropType } from "vue";
import { NuxtLink } from "#components";
import { useLocalePath } from "../composables/useLocalePath";

/**
 * Locale-aware NuxtLink component
 *
 * Automatically prefixes the `to` prop with the current or specified locale
 * based on the localePrefix configuration.
 *
 * All NuxtLink props are forwarded automatically via $attrs.
 *
 * @example
 * ```vue
 * <!-- Uses current locale -->
 * <NuxtLinkLocale to="/about">About</NuxtLinkLocale>
 *
 * <!-- Explicit locale -->
 * <NuxtLinkLocale to="/about" locale="de">Über uns</NuxtLinkLocale>
 *
 * <!-- With all NuxtLink props -->
 * <NuxtLinkLocale
 *   to="/products"
 *   active-class="font-bold"
 *   exact
 * >
 *   Products
 * </NuxtLinkLocale>
 * ```
 */
export default defineComponent({
  name: "NuxtLinkLocale",

  // Don't inherit attrs - we'll forward them manually to NuxtLink
  inheritAttrs: false,

  props: {
    /**
     * Target path (will be locale-prefixed)
     */
    to: {
      type: [String, Object] as PropType<string | Record<string, unknown>>,
      required: true,
    },

    /**
     * Target locale (defaults to current locale)
     */
    locale: {
      type: String,
      default: undefined,
    },
  },

  setup(props, { slots, attrs }) {
    const localePath = useLocalePath();

    // Compute localized path
    const localizedTo = computed(() => {
      return localePath(props.to, props.locale);
    });

    return () => {
      // Forward all attrs to NuxtLink, overriding 'to' with localized version
      return h(NuxtLink, { ...attrs, to: localizedTo.value }, slots);
    };
  },
});
