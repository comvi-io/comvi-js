import {
  defineComponent,
  inject,
  h,
  Fragment,
  type PropType,
  type Component,
  type VNode,
} from "vue";
// The PURE rich-text seam: `prepareTranslation` hands the tag grammar to core
// through `tagInterpolation.extensions` on EVERY call, so rendering `<T>`
// never makes `<tag>` markup ambient for plain string-API `t()`. Importing
// `@comvi/core/tags` instead would do exactly that — it is the one
// side-effectful subpath, and no module in this package names it.
import {
  prepareTranslation,
  type PendingHandler,
  type PrepareTranslationSource,
} from "@comvi/core/rich-text";
import type { TranslationParams, TranslationResult, VirtualNode } from "@comvi/core";
import { I18N_INJECTION_KEY } from "../keys";

/**
 * Component handler types for the `components` prop
 */
type ComponentHandler =
  | string // HTML tag name: "strong", "em", etc.
  | Component // Vue component
  | {
      component: string | Component;
      props?: Record<string, unknown>;
    };

/**
 * Components prop type for tag interpolation
 */
type ComponentsMap = Record<string, ComponentHandler>;

/**
 * Translation component for Vue
 * Renders translated content with support for slots and components prop as tag handlers
 *
 * @example
 * ```vue
 * <!-- Simple usage -->
 * <T i18nKey="greeting" />
 *
 * <!-- With parameters -->
 * <T i18nKey="welcome" :params="{ name: 'John' }" />
 *
 * <!-- With tag interpolation using slots -->
 * <T i18nKey="welcome_link">
 *   <template #link="{ children }">
 *     <a href="/help">{{ children }}</a>
 *   </template>
 * </T>
 *
 * <!-- With tag interpolation using components prop -->
 * <T
 *   i18nKey="welcome_link"
 *   :components="{
 *     link: { component: 'a', props: { href: '/help' } },
 *     bold: 'strong'
 *   }"
 * />
 *
 * <!-- With default-slot fallback for missing translations -->
 * <T i18nKey="maybe.missing">Shown when the key has no translation</T>
 *
 * <!-- With specific namespace -->
 * <T i18nKey="button.submit" ns="forms" />
 *
 * <!-- With specific locale -->
 * <T i18nKey="greeting" locale="fr" />
 * ```
 */
export const T = /*@__PURE__*/ defineComponent({
  name: "T",
  props: {
    /**
     * Translation key to look up
     */
    i18nKey: {
      type: String,
      required: true,
    },

    /**
     * Parameters for interpolation
     * These will be merged with slot content
     */
    params: {
      type: Object as PropType<Record<string, unknown>>,
      default: () => ({}),
    },

    /**
     * Namespace to use (optional)
     * If not specified, uses the default namespace
     */
    ns: {
      type: String,
      default: undefined,
    },

    /**
     * Specific locale to use (optional)
     * If not specified, uses the current locale
     */
    locale: {
      type: String,
      default: undefined,
    },

    /**
     * Fallback text to display if translation is missing (optional)
     * If not specified, returns the key itself
     */
    fallback: {
      type: String,
      default: undefined,
    },

    /**
     * Skip post-processing (optional)
     * When true, prevents post-processors like IncontextEditor from adding invisible marker characters
     */
    raw: {
      type: Boolean,
      default: undefined,
    },

    /**
     * Components map for tag interpolation (optional)
     * Maps tag names to their handlers (string tag name, component, or config object)
     *
     * @example
     * {
     *   bold: 'strong',                              // HTML tag name
     *   link: { component: 'a', props: { href: '#' } }, // With props
     *   btn: MyButton                                 // Vue component
     * }
     */
    components: {
      type: Object as PropType<ComponentsMap>,
      default: undefined,
    },
  },

  setup(props, { slots }) {
    const i18n = inject(I18N_INJECTION_KEY);

    if (!i18n) {
      throw new Error(
        "[i18n] <T> component must be used within a Vue app with i18n plugin installed",
      );
    }

    // prepareTranslation consumes the core-shaped hasTranslation; VueI18n's
    // hasTranslation returns a ComputedRef, so adapt to the imperative check.
    // Reactivity is carried by tRaw (locale/cache/config refs).
    const source: PrepareTranslationSource = {
      tRaw: (key, params) => i18n.tRaw(key, params),
      hasTranslation: (key, locale, namespace, checkFallbacks) =>
        i18n.hasTranslationNow(key, { locale, namespace, checkFallbacks }),
    };

    // Flatten single-string arrays for template {{ children }} compatibility
    const flattenChildren = (children: (string | VNode)[]) =>
      children.length === 1 && typeof children[0] === "string" ? children[0] : children;

    return () => {
      // Slots participate as tag handlers (default included, for compat);
      // the components prop wins on name collisions.
      const merged: Record<string, unknown> = {};
      let hasHandlers = false;
      for (const name of Object.keys(slots)) {
        if (slots[name]) {
          merged[name] = slots[name];
          hasHandlers = true;
        }
      }
      if (props.components) {
        Object.assign(merged, props.components);
        hasHandlers = true;
      }

      const prepared = prepareTranslation(source, {
        i18nKey: props.i18nKey,
        params: props.params as TranslationParams,
        ns: props.ns,
        locale: props.locale,
        fallback: props.fallback,
        raw: props.raw,
        components: hasHandlers ? merged : undefined,
      });

      // Default-slot fallback for missing translations (parity with the
      // react/solid/svelte wrappers' children fallback).
      const defaultSlot = slots.default;
      if (prepared.isMissing && defaultSlot) {
        return defaultSlot();
      }

      const content = prepared.content;
      if (typeof content === "string") {
        return content;
      }

      // Marker tag → pending framework handler (slot or Vue component)
      const pendingByMarker = new Map<string, PendingHandler>();
      for (const pending of prepared.pendingHandlers) {
        pendingByMarker.set(pending.marker, pending);
      }

      // Resolve an opaque handler: slot functions receive { children },
      // Vue components receive children through their default slot.
      const resolvePending = (pending: PendingHandler, children: (string | VNode)[]): VNode => {
        try {
          const slot = slots[pending.name];
          if (slot && pending.handler === slot) {
            const rendered = slot({ children: flattenChildren(children) });
            const nodes = Array.isArray(rendered) ? rendered : [rendered];
            if (nodes.length <= 1) {
              return nodes.length === 0 ? h(Fragment, {}, []) : (nodes[0] as VNode);
            }
            return h(Fragment, {}, nodes);
          }
          return h(pending.handler as Component, pending.props ?? {}, {
            default: () => flattenChildren(children),
          });
        } catch (error) {
          i18n.reportError(error, { source: "translation", tagName: pending.name });
          return h("span", {}, children);
        }
      };

      // Convert VirtualNode children to Vue VNodes (recursively resolves markers)
      const convertList = (items: TranslationResult): (string | VNode)[] => {
        if (typeof items === "string") {
          return items ? [items] : [];
        }
        return items.map((item) => (typeof item === "string" ? item : convertNode(item)));
      };

      const convertNode = (node: VirtualNode): VNode | string => {
        if (node.type === "text") return node.text;

        if (node.type === "fragment") {
          return h(Fragment, { key: node.key }, convertList(node.children as TranslationResult));
        }

        const children = convertList(node.children as TranslationResult);
        const pending = pendingByMarker.get(node.tag);
        if (pending !== undefined) {
          return resolvePending(pending, children);
        }
        return h(node.tag, node.props, children);
      };

      return content.map((item) => (typeof item === "string" ? item : convertNode(item)));
    };
  },
});
