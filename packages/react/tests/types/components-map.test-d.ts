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

// REGRESSION PIN: `props` keeps a permissive value type. An INTERFACE is not
// assignable to core's `Record<string, unknown>` (only type-literal objects
// are), so adopting core's `props` verbatim would reject props a caller
// legitimately holds. All three wrappers agree on this.
interface LinkProps {
  href: string;
}
declare const interfaceProps: LinkProps;
export const _InterfacePropsStillAssign: ComponentsMap = {
  link: { tag: "a", props: interfaceProps },
};

// A component whose extra prop is REQUIRED can only be fed through `props` —
// the bare-handler signature rejects it by contravariance, so the config
// entry's target is deliberately looser than `ComponentTarget`.
declare const _Button: (props: { children: React.ReactNode; tone: string }) => React.ReactElement;
export type _ConfigRequiredProp = Accepts<{
  btn: { component: typeof _Button; props: { tone: string } };
}>;
export type _ConfigRequiredPropTagAlias = Accepts<{
  btn: { tag: typeof _Button; props: { tone: string } };
}>;

// The widening is not a blank cheque.
// @ts-expect-error -- a config entry must still name a target; `isTagComponentConfig`
// rejects a `props`-only object and the pipeline forwards it as an opaque handler
export type _RejectsTargetlessConfig = Accepts<{ link: { props: { href: string } } }>;
// @ts-expect-error -- no `tag`/`component`/`props`, so not a config entry
export type _RejectsForeignObject = Accepts<{ link: { href: "/help" } }>;
// @ts-expect-error -- a number is not a renderable target
export type _RejectsNonTarget = Accepts<{ link: 42 }>;
