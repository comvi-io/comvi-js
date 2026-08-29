import type { Component, Snippet } from "svelte";
import type { TranslationKeys, PermissiveKey, TranslationParams } from "@comvi/core";

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
export type ComponentMapping =
  | string // HTML tag name: "strong", "em", etc.
  | Component<any> // Svelte component — receives content as `children` snippet
  | {
      tag?: string | Component<any>;
      /** Alias for `tag`, matching vue's config form. */
      component?: string | Component<any>;
      props?: Record<string, unknown>;
    };

export type ComponentMap = Record<string, ComponentMapping>;

export interface TProps {
  i18nKey: keyof TranslationKeys | PermissiveKey;
  params?: TranslationParams;
  ns?: string;
  locale?: string;
  /** Shown when the key is missing. Takes priority over the children snippet. */
  fallback?: string;
  /** Skip the post-processors that honour it, for this call only. */
  raw?: boolean;
  /** Tag-name → handler map (see {@link ComponentMap}). */
  components?: ComponentMap;
  /** Rendered when the key is missing and no `fallback` prop was given. */
  children?: Snippet;
}
