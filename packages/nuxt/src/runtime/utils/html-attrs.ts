import { useHead } from "#app";
import { getTextDirection } from "@comvi/core";
import { computed, watch, type Ref } from "vue";
import type { LocaleObject } from "../../types";

/**
 * `comvi.head`: `<html lang dir>` from the active locale, derived exactly as
 * `useLocaleHead()` derives them, so an app that also calls it registers a
 * second head entry with the same values and nothing fights. Deliberately not
 * a call into `useLocaleHead()`: that pulls the route and URL helpers into the
 * client floor for two attributes.
 */
export function useHtmlAttrs(
  localeState: Ref<string>,
  defaultLocale: string,
  localeObjects: Record<string, LocaleObject>,
) {
  const head = computed(() => {
    const locale = localeState.value || defaultLocale;
    const lang = localeObjects[locale]?.iso || locale;
    return { htmlAttrs: { lang, dir: localeObjects[locale]?.dir ?? getTextDirection(lang) } };
  });
  useHead(head);

  if (!import.meta.server) {
    // The head renderer patches the DOM a task after Vue's render; this writes
    // in the same flush as the text, and only an attribute whose DOM value is
    // still the one written last (see useLocaleHead.ts for the full reasoning).
    // When `useLocaleHead()` runs too, whichever watcher runs second finds the
    // new value already there and writes nothing.
    const root = document.documentElement;
    watch(
      head,
      ({ htmlAttrs: next }, { htmlAttrs: prev }) => {
        for (const name of ["lang", "dir"] as const) {
          if (next[name] !== prev[name] && root.getAttribute(name) === prev[name]) {
            root.setAttribute(name, next[name]);
          }
        }
      },
      { flush: "post" },
    );
  }
}
