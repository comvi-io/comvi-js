import {
  defineComponent,
  inject,
  h,
  Fragment,
  type PropType,
  type Component,
  type VNode,
} from "vue";
import { I18N_INJECTION_KEY } from "../keys";
import type {
  TranslationParams,
  TranslationResult,
  TagCallbackParams,
  VirtualNode,
} from "@comvi/core";
import { createElement } from "@comvi/core";

/**
 * Marker prefix for Vue component/slot handling in tag interpolation
 * Used to identify VirtualNodes that should be converted to Vue-specific elements
 */
const MARKER_PREFIX = "__vue_handler_";
const MARKER_SUFFIX = "__";

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
 * Convert TranslationResult children to format suitable for slot/component
 */
function childrenToArray(children: TranslationResult): (string | VirtualNode)[] {
  if (typeof children === "string") {
    return children ? [children] : [];
  }
  return children;
}

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
 * <!-- With specific namespace -->
 * <T i18nKey="button.submit" ns="forms" />
 *
 * <!-- With specific locale -->
 * <T i18nKey="greeting" locale="fr" />
 * ```
 */
export const T = defineComponent({
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

    return () => {
      const key = props.i18nKey;

      // Store Vue component/slot handlers for later rendering
      // Handlers receive already-converted Vue VNodes (not TranslationResult)
      const vueHandlers = new Map<string, (children: (string | VNode)[]) => VNode>();

      // Build tag handlers that return VirtualNode (core format)
      // Priority: components prop > slots
      const tagHandlers: Record<string, (params: TagCallbackParams) => VirtualNode | string> = {};

      // Shared: register a Vue handler + its marker tag handler
      const registerVueHandler = (
        tagName: string,
        vueHandler: (children: (string | VNode)[]) => VNode,
      ) => {
        vueHandlers.set(tagName, (children) => {
          try {
            return vueHandler(children);
          } catch (error) {
            i18n.reportError(error, { source: "translation", tagName });
            return h("span", {}, children);
          }
        });
        tagHandlers[tagName] = ({ children }: TagCallbackParams) =>
          createElement(
            `${MARKER_PREFIX}${tagName}${MARKER_SUFFIX}`,
            {},
            childrenToArray(children),
          );
      };

      // Flatten single-string arrays for template {{ children }} compatibility
      const flattenChildren = (children: (string | VNode)[]) =>
        children.length === 1 && typeof children[0] === "string" ? children[0] : children;

      // Process components prop first (higher priority)
      if (props.components) {
        for (const [tagName, handler] of Object.entries(props.components)) {
          if (typeof handler === "string") {
            tagHandlers[tagName] = ({ children }: TagCallbackParams) =>
              createElement(handler, {}, childrenToArray(children));
          } else if (typeof handler === "object" && handler !== null && "component" in handler) {
            const component = handler.component;
            const componentProps = handler.props || {};
            if (typeof component === "string") {
              tagHandlers[tagName] = ({ children }: TagCallbackParams) =>
                createElement(component, componentProps, childrenToArray(children));
            } else {
              registerVueHandler(tagName, (children) =>
                h(component, componentProps, { default: () => flattenChildren(children) }),
              );
            }
          } else {
            registerVueHandler(tagName, (children) =>
              h(handler as Component, {}, { default: () => flattenChildren(children) }),
            );
          }
        }
      }

      // Process slots (only if not already defined in components)
      for (const [slotName, slot] of Object.entries(slots)) {
        if (slot && !(slotName in tagHandlers)) {
          registerVueHandler(slotName, (children) => {
            const rendered = slot({ children: flattenChildren(children) });
            const nodes = Array.isArray(rendered) ? rendered : [rendered];
            if (nodes.length <= 1) {
              return nodes.length === 0 ? h(Fragment, {}, []) : (nodes[0] as VNode);
            }
            return h(Fragment, {}, nodes);
          });
        }
      }

      // Build translation params
      const translationParams: TranslationParams = {
        ...props.params,
        ...tagHandlers,
      } as TranslationParams;
      if (props.ns !== undefined) translationParams.ns = props.ns;
      if (props.locale !== undefined) translationParams.locale = props.locale;
      if (props.fallback !== undefined) translationParams.fallback = props.fallback;
      if (props.raw !== undefined) translationParams.raw = props.raw;

      // Get translated content
      const content = i18n.tRaw(key, translationParams);

      if (typeof content === "string") {
        return content;
      }

      // Convert VirtualNode children to Vue VNodes (recursively handles markers)
      const convertChildren = (childResult: TranslationResult): (string | VNode)[] => {
        if (typeof childResult === "string") {
          return childResult ? [childResult] : [];
        }
        return childResult.map((child) => (typeof child === "string" ? child : convertNode(child)));
      };

      // Convert VirtualNode to Vue VNode, resolving marker nodes
      const convertNode = (node: VirtualNode): VNode | string => {
        if (node.type === "text") return node.text;

        if (node.type === "fragment") {
          return h(
            Fragment,
            { key: node.key },
            convertChildren(node.children as TranslationResult),
          );
        }

        const tag = node.tag;
        const convertedChildren = convertChildren(node.children as TranslationResult);

        // Check for Vue handler marker
        if (tag.startsWith(MARKER_PREFIX) && tag.endsWith(MARKER_SUFFIX)) {
          const handlerName = tag.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length);
          const handler = vueHandlers.get(handlerName);
          if (handler) {
            try {
              return handler(convertedChildren);
            } catch (error) {
              i18n.reportError(error, { source: "translation", tagName: handlerName });
              return h("span", {}, convertedChildren);
            }
          }
        }

        return h(tag, node.props, convertedChildren);
      };

      return content.map((item) => (typeof item === "string" ? item : convertNode(item)));
    };
  },
});
