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

export type ComponentHandler =
  | string // HTML tag name: "strong", "em", etc.
  | ((props: { children?: JSX.Element }) => JSX.Element) // SolidJS component
  | {
      tag: string | ((props: any) => JSX.Element);
      props?: Record<string, any>;
    };

export type ComponentMap = Record<string, ComponentHandler>;
