// F18 (Q5) — `@comvi/next/client` re-exports react's `<T>`, so a next client
// component writes the same `raw` prop and the same rename applies. An
// unrelated component's `raw`, and one inside an attribute VALUE, survive.
"use client";

import { T, useI18n } from "@comvi/next/client";

function Badge(props: { raw?: boolean }) {
  return null;
}

export function Greeting() {
  const { locale } = useI18n();

  return (
    <div data-locale={locale}>
      <T i18nKey="greeting" raw />
      <T i18nKey="greeting" raw={false} />
      <T i18nKey="greeting" badge={<Badge raw />}>
        Fallback
      </T>
    </div>
  );
}
