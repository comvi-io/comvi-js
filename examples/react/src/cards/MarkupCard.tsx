import { T } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";

// The catalog wraps words in <link>…</link>; this component decides that a
// link is an <a>. Only <T> parses tags, so plain `t()` output stays text.
const components = {
  link: <a href="https://comvi.io/docs" target="_blank" rel="noreferrer" />,
};

export function MarkupCard() {
  return (
    <FeatureCard feature="tags">
      <p className="widget" data-testid="read-more">
        <T i18nKey="docs.read_more" components={components} />
      </p>
    </FeatureCard>
  );
}
