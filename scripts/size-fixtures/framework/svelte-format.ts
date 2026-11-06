// Framework size fixture: `useFormat()` of `@comvi/svelte/format`, on a real instance through
// the context (design §3.3): the core's formatters, the relative clock, the binding's cell.
import { createI18n } from "@comvi/core";
import { setI18n } from "@comvi/svelte";
import { useFormat } from "@comvi/svelte/format";

const i18n = createI18n({ locale: "en" });

export const setup = () => {
  setI18n(i18n);
  return useFormat().relative(Date.now() - 86_400_000);
};
