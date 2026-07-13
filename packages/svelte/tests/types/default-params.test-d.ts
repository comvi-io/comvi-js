import type { UseI18nReturn } from "@comvi/svelte";

declare module "@comvi/core" {
  interface TranslationKeys {
    review: { formality: "formal" | "informal" };
    greeting: { formality: "formal" | "informal"; name: string };
  }
}

type Defaults = { formality: "formal" | "informal" };
declare const scoped: UseI18nReturn<Defaults>;

scoped.t.subscribe((t) => {
  t("review");
  t("review", { formality: "informal" });
  t("greeting", { name: "Eugene" });

  // @ts-expect-error missing non-defaulted parameter
  t("greeting");
  // @ts-expect-error defaulted parameter keeps the generated value type
  t("review", { formality: 123 });
});

scoped.tRaw.subscribe((tRaw) => {
  tRaw("review");
  // @ts-expect-error defaulted parameter keeps the generated value type
  tRaw("review", { formality: 123 });
});

scoped.setDefaultParams({ formality: "informal" });
// @ts-expect-error runtime replacements preserve the declared default type
scoped.setDefaultParams({ formality: 123 });
