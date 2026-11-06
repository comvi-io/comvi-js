/**
 * @comvi/svelte — the Svelte 5 binding of the 0.8 core (design §3.6): `setI18n()`, `useI18n()`,
 * `<T>` and `handover()` for a server render. `createI18n` is re-exported, so a Svelte app
 * imports one package; `@comvi/svelte/format` adds `useFormat()`.
 */
import type { TComponent } from "./binding";
import TComponentImpl from "./T.svelte";

export { createI18n } from "@comvi/core";
export { handover } from "@comvi/core/internal";
export { setI18n } from "./context.svelte.js";
export { useI18n } from "./binding";

/**
 * Renders one message; params are props. A tag renders through a function prop of its name (a
 * handler returning text), else its entry in `components` (`components={{ b: "strong" }}`, nested
 * tags render too), else a snippet of its name (`{#snippet link(children)}<a
 * href="/terms">{children}</a>{/snippet}`, `children` the tag's text), else as text; a prop or
 * an entry that is `undefined` leaves the tag to the next. Every prop but `i18nKey`,
 * `components` and the per-call options `ns`, `locale` and `markers` is a message param. `ns` is
 * explicit: `<T>` never takes the namespace of a `useI18n(ns)` above it; `useI18n(ns).T` is the
 * bound one. `<T>` reads only: `useI18n("account")` in the component (or `i18n.load`, the
 * `namespaces` option) loads it. `markers={false}` opts the message out of an in-context editor
 * session.
 */
export const T = TComponentImpl as unknown as TComponent;

export type {
  BoundT,
  Children,
  TagComponent,
  TagSnippet,
  TComponent,
  UntypedParams,
  UseI18n,
} from "./binding";
export type { Handover } from "@comvi/core/internal";
export type {
  Catalog,
  I18n,
  I18nError,
  I18nErrorCode,
  I18nOptions,
  Loader,
  Plugin,
  // A generated comvi.d.ts that augments @comvi/svelte imports Tag from it (typegen v2).
  Catalogs,
  Tag,
} from "@comvi/core";
