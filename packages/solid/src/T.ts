/**
 * The exported `<T>` (design §3.4, R3-5): its own module and chunk — `useI18n(ns).T` is the
 * bound one (binding.ts).
 */
import { read, type TComponent } from "./binding";

/**
 * Renders one message; params are props. A tag renders through, in this order: a prop of the
 * tag's name (`link={(c) => <a href="/terms">{c}</a>}`), then its entry in `components`
 * (`components={{ b: "strong", br: "br", link: { component: "a", props: { href: "/terms" } } }}`,
 * an empty tag passes no children, so a void element renders); a prop or an entry that is
 * `undefined` leaves the tag to the next; with neither, the tag's content renders as text. Every
 * prop but `i18nKey`, `components` and the per-call options `ns`, `locale` and `markers` is a
 * message param, `class` too. `ns` is explicit: `<T>` never takes the namespace of a
 * `useI18n(ns)` above it (R3-5); `useI18n(ns).T` is the bound one. `<T>` reads only: it loads
 * nothing, `<T ns="account">` neither. `markers={false}` opts the message out of an in-context
 * editor session (R3-14 H9).
 */
export const T = ((p: Record<string, unknown>) => read(p)) as TComponent;
