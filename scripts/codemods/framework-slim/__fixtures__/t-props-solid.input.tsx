// F18 (Q5) — solid's `<T raw>` -> `<T skipPostProcess>`, same rule as react's.
import { T } from "@comvi/solid";

export function Greeting() {
  return (
    <T i18nKey="greeting" raw>
      Fallback
    </T>
  );
}
