// The `components` prop must DESCRIBE every entry form the runtime already
// accepts. `prepareTranslation` reads `handler.tag ?? handler.component`, so
// the `tag` spelling has always worked here — the vue-only `{ component, … }`
// declaration just hid it. The entry type is now core's own
// `TagComponentConfig` narrowed to Vue targets, so the two cannot drift.
import { defineComponent, h, type Component } from "vue";
import type { TagComponentConfig } from "@comvi/core/rich-text";
import { T } from "../../src/index";

type ComponentsMap = NonNullable<InstanceType<typeof T>["$props"]["components"]>;

/** Fails to compile unless `M` is a legal components map. */
type Accepts<M extends ComponentsMap> = M;

const _SomeComponent = defineComponent({ setup: () => () => h("a") });
declare const _AnyComponent: Component;

// The plain targets.
export type _TagName = Accepts<{ bold: "strong" }>;
export type _Component = Accepts<{ btn: typeof _SomeComponent }>;
export type __AnyComponent = Accepts<{ btn: Component }>;

// Core's config entry form. `component` is the spelling vue documented; `tag`
// is the sibling spelling that the shared pipeline has always honoured.
export type _ConfigComponentString = Accepts<{
  link: { component: "a"; props: { href: string } };
}>;
export type _ConfigComponentTarget = Accepts<{
  btn: { component: typeof _SomeComponent; props: { tone: string } };
}>;
export type _ConfigTagString = Accepts<{ link: { tag: "a"; props: { href: string } } }>;
export type _ConfigTagTarget = Accepts<{ btn: { tag: typeof _AnyComponent } }>;
export type _ConfigPropsOptional = Accepts<{ link: { component: "a" } }>;

// A non-target primitive is still rejected.
// @ts-expect-error -- a number is not a renderable target
export type _RejectsNonTarget = Accepts<{ link: 42 }>;

// NOT a consequence of the widening, and pinned here so nobody re-discovers it
// as a regression: vue accepts an arbitrary object entry because Vue's OWN
// `Component` type does. Verified against the pre-widening union — `{ href }`
// compiled there too. The react map rejects the same entry, so this asymmetry
// belongs to `Component`, not to the config form.
export type _ComponentTypeAlreadyAcceptsAnyObject = Accepts<{ link: { href: "/help" } }>;

// THE ANTI-DRIFT GUARD: the entry shape this package accepts is the shape core
// reads. Rename or retype a field in `TagComponentConfig` and this stops
// compiling instead of silently diverging again.
declare function readsAsCoreConfig(config: TagComponentConfig): void;
readsAsCoreConfig({ component: "a", props: { href: "/help" } });
readsAsCoreConfig({ tag: "a", props: { href: "/help" } });
