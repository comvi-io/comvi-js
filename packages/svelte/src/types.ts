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
