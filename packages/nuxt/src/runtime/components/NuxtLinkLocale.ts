import { defineComponent, h, computed, type PropType } from "vue";
import { NuxtLink } from "#components";
import { useRuntimeConfig } from "#app";
import { useLocalePath } from "../composables/useLocalePath";
import { serializeLocaleCookie } from "../utils/locale-path";

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
    const { localeCookie, locales } = useRuntimeConfig().public.comvi;

    // A link that names a locale is a locale switch, and the cookie is the
    // record of the user's choice: the click writes it BEFORE the navigation.
    // The route middleware resolves a URL that names no locale (the default
    // locale's under `as-needed`, every URL under `never`) from this cookie,
    // and would otherwise answer with the locale being switched away from.
    // Written straight to `document.cookie`: a `useCookie()` ref is flushed
    // asynchronously, and the middleware reads the document's value.
    const recordLocale = () => {
      const { locale } = props;
      if (!locale || !localeCookie || !locales.includes(locale)) return;
      document.cookie = serializeLocaleCookie(
        localeCookie,
        locale,
        // A browser drops a `Secure` cookie set from a plain-HTTP page.
        localeCookie.secure && location.protocol === "https:",
      );
    };

    const localizedTo = computed(() => {
      return localePath(props.to, props.locale);
    });

    return () => {
      const { onClick, ...rest } = attrs as { onClick?: (event: MouseEvent) => void };
      return h(
        NuxtLink,
        {
          ...rest,
          to: localizedTo.value,
          onClick: (event: MouseEvent) => {
            onClick?.(event);
            // No `defaultPrevented` check: `RouterLink` has already called
            // `preventDefault()` on every click it turns into a navigation.
            recordLocale();
          },
        },
        slots,
      );
    };
  },
});
