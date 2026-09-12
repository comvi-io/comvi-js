// F18 (Q5) — react's `<T raw>` -> `<T skipPostProcess>`: bare, valued, and a
// deeply nested unrelated `raw` (a different component, and one inside an
// attribute VALUE) that must survive untouched.
import { T } from "@comvi/react";

function Foo(props: { raw?: boolean }) {
  return null;
}

function Other(props: { raw?: boolean }) {
  return null;
}

export function Greeting() {
  return (
    <div>
      <T i18nKey="greeting" raw />
      <T i18nKey="greeting" raw={true} />
      <T i18nKey="greeting" tooltip={<Foo raw />}>
        Fallback
      </T>
      <Other raw />
    </div>
  );
}
