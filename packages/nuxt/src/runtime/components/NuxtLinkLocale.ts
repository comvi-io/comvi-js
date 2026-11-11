import { defineComponent, h, computed, type PropType } from "vue";
import { NuxtLink } from "#components";
import { useNuxtApp, useRoute, useRouter, useRuntimeConfig } from "#app";
import { useLocalePath } from "../composables/useLocalePath";
import { setTarget, unslashed } from "../utils/target";

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
    const { locales } = useRuntimeConfig().public.comvi;
    const nuxtApp = useNuxtApp();
    const router = useRouter();
    const route = useRoute();

    // A link that names a locale is a locale switch. The click records the locale for the
    // navigation it starts (in memory, `utils/target.ts`): the route middleware resolves a
    // URL that names no locale (every URL under `never`, the root under `as-needed`) from it.
    // The cookie is written by the middleware once the switch has landed, so a switch that
    // is superseded or aborted records nothing. A link to the URL already on screen (under
    // `never`, every switcher link) starts no navigation, the router runs no guard for a
    // duplicate: the click switches the instance, and the plugin records the cookie when the
    // switch lands.
    const recordLocale = () => {
      const { locale } = props;
      if (!locale || !locales.includes(locale)) return;
      const to = localizedTo.value;
      if (unslashed(router.resolve(to).fullPath) === unslashed(route.fullPath))
        nuxtApp.$i18n.setLocale(locale).catch(() => {});
      else setTarget(nuxtApp, router, locale, to);
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
            // `preventDefault()` on every click it turns into a navigation. A modified or
            // non-primary click, a link with a `target` other than `_self` or an `external`
            // one is a page load (NuxtLink renders a plain anchor): nothing to record in
            // this document.
            const { button, metaKey, ctrlKey, shiftKey, altKey } = event;
            const { target, external } = rest as { target?: string; external?: unknown };
            const load = external || (!!target && !/^_self$/i.test(target));
            if (!button && !metaKey && !ctrlKey && !shiftKey && !altKey && !load) recordLocale();
          },
        },
        slots,
      );
    };
  },
});
