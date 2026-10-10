import type { ReactNode } from "react";
import { useI18n } from "@comvi/react";

type Feature =
  | "interpolation"
  | "plural"
  | "ordinal"
  | "select"
  | "formality"
  | "tags"
  | "formatting"
  | "lazy"
  | "options"
  | "errors"
  | "fallback"
  | "missing"
  | "navigation";

/** A feature's name and one sentence about it, above its live example. */
export function FeatureCard({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { t } = useI18n();

  return (
    <article className="card">
      <h2 className="eyebrow">{t(`demo.${feature}.title`)}</h2>
      <p className="body">{t(`demo.${feature}.body`)}</p>
      {children}
    </article>
  );
}
