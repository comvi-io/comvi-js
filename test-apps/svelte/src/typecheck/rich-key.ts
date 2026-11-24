/**
 * Types of the BUILT @comvi/svelte (`dist/*.d.ts`, through the workspace link) against the
 * catalogs `comvi typegen` generates from ../locales. Never imported by the app: checked by
 * `pnpm typecheck` (svelte-check), where every `@ts-expect-error` must fire.
 *
 * `t()` takes no key whose message has tags (owner decision 21.11.2026): rich text is `<T>`'s,
 * with `components` or snippets (RichKey.svelte).
 */
import { useI18n } from "@comvi/svelte";

export function richKey() {
  const { t } = useI18n();
  const plain: string = t("home.title");
  const withParam: string = t("home.intro", { name: "Ann" });
  // @ts-expect-error a rich key in t()
  t("rich_text.link_text");
  // @ts-expect-error a rich key in t(), even with a handler for its tag
  t("rich_text.link_text", { link: (c: string) => `[${c}]` });
  // @ts-expect-error a rich key with a text param too
  t("rich_text.nested_mixed", {
    count: 2,
    alert: (c: string) => c,
    bold: (c: string) => c,
    link: (c: string) => c,
  });
  return [plain, withParam];
}
