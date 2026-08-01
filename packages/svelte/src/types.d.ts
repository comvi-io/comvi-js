import type { Component, Snippet } from "svelte";
import type { TranslationKeys, PermissiveKey, TranslationParams } from "@comvi/core";

/**
 * Component mapping for tag interpolation in the T component.
 * Maps custom tag names to HTML elements, Svelte components, or configs
 * with props — same shape as the other framework wrappers.
 *
 * Svelte components receive the tag's rendered content as their `children`
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
      /** Element name or Svelte component to render */
      tag?: string | Component<any>;
      /** Alias for `tag` (vue-style config form) */
      component?: string | Component<any>;
      /** Props applied to the rendered element/component */
      props?: Record<string, unknown>;
    };

export type ComponentMap = Record<string, ComponentMapping>;

/**
 * Public props interface for the T component.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import type { TProps } from '@comvi/svelte';
 * </script>
 * ```
 */
export interface TProps {
  /** Translation key to look up */
  i18nKey: keyof TranslationKeys | PermissiveKey;
  /** Interpolation parameters passed to the translation call */
  params?: TranslationParams;
  /** Override the active namespace for this translation */
  ns?: string;
  /** Override the active locale for this translation */
  locale?: string;
  /** Fallback string when the key is missing and no children snippet is provided */
  fallback?: string;
  /** When true, post-processors that support it skip processing for this call */
  raw?: boolean;
  /** Component mapping for tag interpolation (see {@link ComponentMap}) */
  components?: ComponentMap;
  /** Fallback snippet rendered when the translation key is unresolved and no fallback prop is set */
  children?: Snippet;
}
