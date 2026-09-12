/**
 * `ComponentMap` must DESCRIBE every entry form the runtime accepts, and
 * nothing more. Svelte was the one wrapper whose config entry left BOTH `tag`
 * and `component` optional, so a `props`-only entry type-checked and then hit
 * the opaque-handler branch at runtime; and the one whose `props` used core's
 * `Record<string, unknown>`, which an interface-typed props object cannot
 * satisfy. react, solid and vue each pin both of these; svelte had no
 * components-map type test at all.
 */
import type { Component, Snippet } from "svelte";
import type { ComponentMap } from "../../src/index";

/** Fails to compile unless `M` is a legal components map. */
type Accepts<M extends ComponentMap> = M;

declare const _Anchor: Component<{ children?: Snippet }>;
/** A component whose extra prop is REQUIRED — it can only be fed via `props`. */
declare const _Button: Component<{ children?: Snippet; tone: string }>;

// The plain targets.
export type _TagName = Accepts<{ bold: "strong" }>;
export type _Component = Accepts<{ btn: typeof _Anchor }>;

// The config entry form, in both alias spellings and both target kinds.
// `prepareTranslation` reads `handler.tag ?? handler.component`, so the vue
// `component` spelling has always worked here too.
export type _ConfigTagString = Accepts<{ link: { tag: "a"; props: { href: string } } }>;
export type _ConfigComponentString = Accepts<{
  link: { component: "a"; props: { href: string } };
}>;
export type _ConfigTagTarget = Accepts<{ btn: { tag: typeof _Button; props: { tone: string } } }>;
export type _ConfigComponentTarget = Accepts<{
  btn: { component: typeof _Button; props: { tone: string } };
}>;
export type _ConfigPropsOptional = Accepts<{ link: { tag: "a" } }>;
// `false` suppresses a boolean attribute — `elementProps` strips it.
export type _ConfigFalseProp = Accepts<{ link: { tag: "a"; props: { hidden: false } } }>;

// REGRESSION PIN: `props` keeps a permissive value type. An INTERFACE is not
// assignable to core's `Record<string, unknown>` (only type-literal objects
// are), so core's stricter value type rejects props a caller legitimately
// holds. All four wrappers agree on this.
interface LinkProps {
  href: string;
}
declare const interfaceProps: LinkProps;
export const _InterfacePropsStillAssign: ComponentMap = {
  link: { tag: "a", props: interfaceProps },
};

// The widening is not a blank cheque.
// @ts-expect-error -- a config entry must still name a target; `isTagComponentConfig`
// rejects a `props`-only object and the pipeline forwards it as an opaque handler
export type _RejectsTargetlessConfig = Accepts<{ link: { props: { href: string } } }>;
// @ts-expect-error -- neither spelling nor `props`, so not a config entry
export type _RejectsForeignObject = Accepts<{ link: { href: "/help" } }>;
// @ts-expect-error -- a number is not a renderable target
export type _RejectsNonTarget = Accepts<{ link: 42 }>;

// P7: `ComponentMapping` (one entry) is no longer a public name — it is the
// internal `ComponentHandler`, as in solid. `ComponentMap` is the export.
// @ts-expect-error -- not exported from the root
export type _NoComponentMapping = import("../../src/index").ComponentMapping;
