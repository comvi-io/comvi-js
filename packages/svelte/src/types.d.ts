import type { Component, Snippet } from "svelte";
import type { TranslationKeys, PermissiveKey, TranslationParams } from "@comvi/core";

/**
 * A config entry's target. Looser than the bare-handler form on purpose: the
 * entry's own `props` supply whatever else the component needs, so a component
 * with required props belongs here rather than in the handler union below.
 */
export type ComponentTarget = string | Component<any>;

/**
 * Tag-name → handler for `<T>`'s tag interpolation: an HTML tag name, a Svelte
 * component, or a config with props — the same shape as the other wrappers.
 *
 * A Svelte component receives the tag's rendered content as its `children`
 * snippet, plus any `props` from a config mapping.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import type { ComponentMap } from '@comvi/svelte';
 *   import FancyButton from './FancyButton.svelte';
 *
 *   const components: ComponentMap = {
 *     link: { tag: 'a', props: { href: 'https://example.com', class: 'text-blue-600' } },
 *     bold: 'strong',
 *     btn: FancyButton,
 *   };
 * </script>
 *
 * <T i18nKey="rich_text.message" {components} />
 * ```
 */
export type ComponentHandler =
  | string // HTML tag name: "strong", "em", etc.
  | Component<any> // Svelte component — receives content as `children` snippet
  /**
   * The `{ tag | component, props }` config form. `tag` (solid/svelte
   * convention) and `component` (vue convention) are aliases —
   * `prepareTranslation` reads `handler.tag ?? handler.component`. Requiring
   * ONE of the two spellings keeps the guarantee core's all-optional shape
   * gives up, since an entry with neither is not a config at all —
   * `isTagComponentConfig` rejects it and the object is passed on as an opaque
   * handler, which drops the entry's `props` and takes the SSR render down.
   */
  | ({
      /**
       * `any`, not core's `Record<string, unknown>`: an INTERFACE-typed props
       * object is not assignable to `Record<string, unknown>` (only
       * type-literal objects are), so core's stricter value type would reject
       * props a caller legitimately holds. Matches the other three wrappers.
       */
      props?: Record<string, any>;
    } & (
      | { tag: ComponentTarget; component?: ComponentTarget }
      | { component: ComponentTarget; tag?: ComponentTarget }
    ));

export type ComponentMap = Record<string, ComponentHandler>;

interface TBaseProps {
  i18nKey: keyof TranslationKeys | PermissiveKey;
  params?: TranslationParams;
  ns?: string;
  locale?: string;
  /** Shown when the key is missing. Takes priority over the children snippet. */
  fallback?: string;
  /** Skip the post-processors that honour it, for this call only. */
  skipPostProcess?: boolean;
  /**
   * @deprecated Renamed to `skipPostProcess` in 0.5. `raw` is still honored
   * (a dev-only warning fires once per host) and will be removed in a future
   * release.
   */
  raw?: boolean;
  /** Tag-name → handler map (see {@link ComponentMap}). */
  components?: ComponentMap;
  /** Rendered when the key is missing and no `fallback` prop was given. */
  children?: Snippet;
}

/**
 * Every prop that is not declared above is an interpolation param
 * (`<T i18nKey="cart" count={2} />`), so the type has to accept a key it never
 * declared — the same widening `@comvi/react`'s `TProps` has.
 */
export type TProps = TBaseProps & Record<string, unknown>;
