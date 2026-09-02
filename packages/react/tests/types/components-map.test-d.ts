/**
 * The `<T components>` map must DESCRIBE every entry form the runtime already
 * accepts. `prepareTranslation` resolves core's `{ tag | component, props }`
 * config entry and `resolvePending` merges its `props`, but the react type
 * used to list only the plain targets — so tests had to cast around it.
 */
import type * as React from "react";
import type { T } from "../../src/index";

type ComponentsMap = NonNullable<React.ComponentProps<typeof T>["components"]>;

/** Fails to compile unless `M` is a legal components map. */
type Accepts<M extends ComponentsMap> = M;

type RenderFn = (params: { children: React.ReactNode }) => React.ReactElement;

// The plain targets.
export type _TagName = Accepts<{ bold: "strong" }>;
export type _Element = Accepts<{ link: React.ReactElement }>;
export type _RenderFn = Accepts<{ btn: RenderFn }>;

// Core's config entry form, in both alias spellings and all three targets.
export type _ConfigStringTarget = Accepts<{ link: { tag: "a"; props: { href: string } } }>;
export type _ConfigElementTarget = Accepts<{
  link: { component: React.ReactElement; props: { href: string } };
}>;
export type _ConfigFnTarget = Accepts<{
  btn: { component: RenderFn; props: { tone: string } };
}>;
export type _ConfigPropsOptional = Accepts<{ link: { tag: "a" } }>;

// The widening is not a blank cheque: an object that is neither a target nor a
// config entry, and a non-target primitive, are still rejected.
// @ts-expect-error -- no `tag`/`component`/`props`, so not a config entry
export type _RejectsForeignObject = Accepts<{ link: { href: "/help" } }>;
// @ts-expect-error -- a number is not a renderable target
export type _RejectsNonTarget = Accepts<{ link: 42 }>;
