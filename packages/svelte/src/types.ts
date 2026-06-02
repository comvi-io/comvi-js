/**
 * Component mapping for tag interpolation in T component
 * Maps custom tag names to HTML elements with props
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import type { ComponentMap } from '@comvi/svelte';
 *
 *   const components: ComponentMap = {
 *     link: { tag: 'a', props: { href: 'https://example.com', class: 'text-blue-600' } },
 *     bold: 'strong',
 *     icon: { tag: 'span', props: { class: 'icon' } }
 *   };
 * </script>
 *
 * <T i18nKey="rich_text.message" {components} />
 * ```
 */
export type ComponentMapping =
  | string
  | {
      /** HTML tag to render (e.g., 'a', 'strong', 'div') */
      tag: string;
      /** HTML attributes to apply to the element */
      props?: Record<string, string | boolean>;
    };

export type ComponentMap = Record<string, ComponentMapping>;

import type { TranslationKeys, PermissiveKey, TranslationParams } from "@comvi/core";
import type { Snippet } from "svelte";

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
  /** Fallback string when the key is missing and no slot is provided */
  fallback?: string;
  /**
   * When true, passes `raw: true` into the translation call.
   * Suppresses HTML-escaping of the returned string.
   */
  raw?: boolean;
  /**
   * Component mapping for tag interpolation.
   * Note: In Svelte, `<T>` constructs an HTML string and injects it via `{@html}`.
   * Therefore, this map only supports standard HTML tags (e.g. `a`, `strong`),
   * not Svelte Components.
   */
  components?: ComponentMap;
  /**
   * Set of allowed HTML tag names for rendering via {@html}.
   * Tags not in this set are rendered as `<span>` to prevent XSS.
   * Defaults to a safe set of inline/block formatting tags.
   */
  allowedTags?: Set<string>;
  /** Fallback slot rendered when the translation key is unresolved and no fallback prop is set */
  children?: Snippet;
}
