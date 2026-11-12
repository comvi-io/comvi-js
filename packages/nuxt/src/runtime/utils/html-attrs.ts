import { useHead } from "#app";
import { computed, watch, type Ref } from "vue";
import { dir as textDirection } from "@comvi/core/internal";
import type { LocaleObject } from "../../types";

/**
 * `<html lang dir>` of a locale: `lang` its `iso` (or its code), `dir` its declared `dir`,
 * else the direction of that same tag — derived exactly as `useLocaleHead()` derives them.
 */
export const htmlAttrsOf = (locale: string, localeObjects: Record<string, LocaleObject>) => {
  const lang = localeObjects[locale]?.iso || locale;
  return { lang, dir: localeObjects[locale]?.dir ?? textDirection(lang) };
};

/**
 * `comvi.head`: `<html lang dir>` from the locale on screen (the instance's), the same
 * values `useLocaleHead()` writes, so an app that also calls it registers a second head
 * entry with the same values and nothing fights.
 */
export function useHtmlAttrs(locale: Ref<string>, localeObjects: Record<string, LocaleObject>) {
  const head = computed(() => ({ htmlAttrs: htmlAttrsOf(locale.value, localeObjects) }));
  useHead(head);

  if (!import.meta.server) {
    // The head renderer patches the DOM a task after Vue's render; this writes in the
    // same flush as the text, and only an attribute whose DOM value is still the one
    // written last (see useLocaleHead.ts). When `useLocaleHead()` runs too, whichever
    // watcher runs second finds the new value already there and writes nothing.
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
