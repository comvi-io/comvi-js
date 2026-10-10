import type { ReactNode } from "react";
import { useI18n } from "@comvi/react";

/** One feature: its name, one sentence about it, then the live widget. */
export function Card({ feature, children }: { feature: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <article className="card">
      <h2 className="eyebrow">{t(`demo.${feature}.title`)}</h2>
      <p className="body">{t(`demo.${feature}.body`)}</p>
      {children}
    </article>
  );
}
