import type { ReactNode } from "react";
import { T } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

// The catalog wraps words in <link>…</link>; this function decides that a link
// is an <a>. The translator moves the words, the app keeps the markup.
const link = (children: ReactNode) => (
  <a href="https://comvi.io/docs" target="_blank" rel="noreferrer">
    {children}
  </a>
);

export function MarkupCard() {
  return (
    <FeatureCard feature="tags">
      <p className="widget" data-testid="read-more">
        <T i18nKey="docs.read_more" link={link} />
      </p>
    </FeatureCard>
  );
}
