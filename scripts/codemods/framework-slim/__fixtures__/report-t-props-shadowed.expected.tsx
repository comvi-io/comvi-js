// Report-only — a local `T` declaration shadows the imported component, so
// the file is reported and left byte-identical.
import { T } from "@comvi/react";

function T() {
  return null;
}

export function Greeting() {
  return <T i18nKey="greeting" raw />;
}
