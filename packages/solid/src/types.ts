/**
 * Tag-name → handler map for `<T>`'s tag interpolation: an HTML tag name, a
 * Solid component, or a tag plus props.
 *
 * @example
 * ```tsx
 * import type { ComponentMap } from '@comvi/solid';
 *
 * const components: ComponentMap = {
 *   link: { tag: 'a', props: { href: 'https://example.com', class: 'text-blue-600' } },
 *   bold: 'strong',
 *   customBtn: ({ children }) => <button class="btn">{children}</button>
 * };
 *
 * <T i18nKey="rich_text.message" components={components} />
 * ```
 */
import type { JSX } from "solid-js";
import type { TagComponentConfig } from "@comvi/core/rich-text";

/**
 * A config entry's target. Looser than the bare-handler form on purpose: the
 * entry's own `props` supply whatever else the component needs, so a component
 * with required props belongs here rather than in the handler union below.
 */
export type ComponentConfigTarget = string | ((props: any) => JSX.Element);

/**
 * Core's `{ tag | component, props }` entry form, narrowed to Solid targets.
 * `tag` (solid/svelte convention) and `component` (vue convention) are
 * aliases — `prepareTranslation` reads `handler.tag ?? handler.component`, so
 * both have always worked here and only the type said otherwise. Intersecting
 * core's own `TagComponentConfig` keeps the field set from drifting away from
 * the pipeline that actually reads it; requiring ONE of the two spellings
 * keeps the guarantee core's all-optional shape gives up, since an entry with
 * neither is not a config at all — `isTagComponentConfig` rejects it and the
 * object is passed on as an opaque handler.
 */
export type ComponentConfig = Omit<TagComponentConfig, "props"> & {
  /**
   * `any`, not core's `Record<string, unknown>`: an INTERFACE-typed props
   * object is not assignable to `Record<string, unknown>` (only type-literal
   * objects are), so adopting core's stricter value type here would silently
   * break maps that compile today.
   */
  props?: Record<string, any>;
} & (
    | { tag: ComponentConfigTarget; component?: ComponentConfigTarget }
    | { component: ComponentConfigTarget; tag?: ComponentConfigTarget }
  );

export type ComponentHandler =
  | string // HTML tag name: "strong", "em", etc.
  | ((props: { children?: JSX.Element }) => JSX.Element) // SolidJS component
  | ComponentConfig;

export type ComponentMap = Record<string, ComponentHandler>;
