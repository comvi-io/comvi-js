/**
 * Tag handler arguments of the BUILT packages (`dist/*.d.ts`, through the workspace link)
 * against the catalogs `comvi typegen` generates from ../locales. The instance's own
 * `i18n.t()` (and `i18n.ns(name)`) passes a handler the parts of the tag's children, an
 * array; `useI18n().t` and `<T>` pass one React node. Never imported by the app: checked by
 * `pnpm typecheck`, where every `@ts-expect-error` must fire.
 */
import { T, useI18n } from "@comvi/react";
import type { RichParts } from "@comvi/core";
import { i18n } from "../i18n";

// Controls: the instance's handler takes the array the core passes.
i18n.t("rich_text.link_text", { link: (c) => c.join("") });
i18n.t("rich_text.link_text", { link: (c) => c.map((p) => p) });
i18n.ns("default")("rich_text.link_text", { link: (c) => c.length });
i18n.t("rich_text.link_text", {
  link: (c) => {
    const parts: RichParts = c;
    return parts;
  },
});

// @ts-expect-error the instance passes an array, not a string
i18n.t("rich_text.link_text", { link: (c: string) => c });
// @ts-expect-error the `t` of `i18n.ns(name)` passes an array too, not a string
i18n.ns("default")("rich_text.link_text", { link: (c: string) => c });

export function HandlerTypes() {
  const { t } = useI18n();
  // Controls: `useI18n().t` and `<T>` keep the React contract, one node.
  t("rich_text.link_text", { link: (c) => <a href="/x">{c}</a> });
  // @ts-expect-error `useI18n().t` passes one React node, no array
  t("rich_text.link_text", { link: (c) => c.join("") });
  return (
    <>
      <T i18nKey="rich_text.link_text" link={(c) => <a href="/x">{c}</a>} />
      {/* @ts-expect-error `<T>` passes one React node, no array */}
      <T i18nKey="rich_text.link_text" link={(c) => c.join("")} />
    </>
  );
}
