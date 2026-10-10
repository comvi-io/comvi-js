// `ComponentMap` must DESCRIBE every entry form the runtime already accepts.
// `prepareTranslation` reads `handler.tag ?? handler.component`, so the vue
// `component` spelling has always worked here — the solid-only `{ tag, … }`
// declaration just hid it. The entry type is now core's own
// `TagComponentConfig` narrowed to Solid targets, so the two cannot drift.
import type { JSX } from "solid-js";
import type { TagComponentConfig } from "@comvi/core/rich-text";
import type { ComponentMap } from "../../src/index";

/** Fails to compile unless `M` is a legal components map. */
type Accepts<M extends ComponentMap> = M;

declare const _Anchor: (props: { children?: JSX.Element }) => JSX.Element;
/** A component whose extra prop is REQUIRED — it can only be fed via `props`. */
declare const _Button: (props: { children?: JSX.Element; tone: string }) => JSX.Element;

// The plain targets.
export type _TagName = Accepts<{ bold: "strong" }>;
export type _Component = Accepts<{ btn: typeof _Anchor }>;

// Core's config entry form. `tag` is the spelling solid documented; `component`
// is the sibling spelling that the shared pipeline has always honoured.
export type _ConfigTagString = Accepts<{ link: { tag: "a"; props: { href: string } } }>;
export type _ConfigComponentString = Accepts<{
  link: { component: "a"; props: { href: string } };
}>;
export type _ConfigTagTarget = Accepts<{ btn: { tag: typeof _Button; props: { tone: string } } }>;
export type _ConfigComponentTarget = Accepts<{
  btn: { component: typeof _Button; props: { tone: string } };
}>;
export type _ConfigPropsOptional = Accepts<{ link: { tag: "a" } }>;

// REGRESSION PIN: `props` keeps solid's permissive value type. An INTERFACE is
// not assignable to core's `Record<string, unknown>` (only type-literal objects
// are), so adopting core's `props` verbatim would have silently broken maps
// that already compile.
interface LinkProps {
  href: string;
}
declare const interfaceProps: LinkProps;
export const _InterfacePropsStillAssign: ComponentMap = {
  link: { tag: "a", props: interfaceProps },
};

// The widening is not a blank cheque.
// @ts-expect-error -- a config entry must still name a target
export type _RejectsTargetlessConfig = Accepts<{ link: { props: { href: string } } }>;
// @ts-expect-error -- neither spelling nor `props`, so not a config entry
export type _RejectsForeignObject = Accepts<{ link: { href: "/help" } }>;
// @ts-expect-error -- a number is not a renderable target
export type _RejectsNonTarget = Accepts<{ link: 42 }>;

// THE ANTI-DRIFT GUARD: the entry shape this package accepts is the shape core
// reads. Rename or retype a field in `TagComponentConfig` and this stops
// compiling instead of silently diverging again.
declare function readsAsCoreConfig(config: TagComponentConfig): void;
readsAsCoreConfig({ tag: "a", props: { href: "/help" } });
readsAsCoreConfig({ component: "a", props: { href: "/help" } });
