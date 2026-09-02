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
// per call, so rendering `<T>` never makes `<tag>` markup ambient for plain
// string-API `t()`. Importing `@comvi/core/tags` would do exactly that.
import {
  prepareTranslation,
  type PendingHandler,
  type PrepareTranslationSource,
  type TagComponentConfig,
} from "@comvi/core/rich-text";
import type { TranslationParams, TranslationResult, VirtualNode } from "@comvi/core";
import { I18N_INJECTION_KEY } from "../keys";

/** What a tag can resolve to in Vue. */
type ComponentTarget =
  | string // HTML tag name: "strong", "em", etc.
  | Component; // Vue component

/**
 * Core's `{ tag | component, props }` entry form, narrowed to Vue targets.
 * `tag` (solid/svelte convention) and `component` (vue convention) are
 * aliases — `prepareTranslation` reads `handler.tag ?? handler.component`, so
 * both have always worked here and only the type said otherwise. Intersecting
 * core's own `TagComponentConfig` keeps the field set from drifting away from
 * the pipeline that actually reads it; requiring ONE of the two spellings
 * keeps the guarantee core's all-optional shape gives up, since an entry with
 * neither is not a config at all — `isTagComponentConfig` rejects it and the
 * object is passed on as an opaque handler.
 */
type ComponentConfig = Omit<TagComponentConfig, "props"> & {
  /**
   * `any`, not core's `Record<string, unknown>`: an INTERFACE-typed props
   * object is not assignable to `Record<string, unknown>` (only type-literal
   * objects are), so core's stricter value type would reject props a caller
   * legitimately holds. Matches `@comvi/solid`.
   */
  props?: Record<string, any>;
} & (
    | { tag: ComponentTarget; component?: ComponentTarget }
    | { component: ComponentTarget; tag?: ComponentTarget }
  );

type ComponentHandler = ComponentTarget | ComponentConfig;

type ComponentsMap = Record<string, ComponentHandler>;

/**
 * Renders a translation. Named slots and the `components` prop both act as tag
 * handlers; the default slot is the fallback for a missing key.
 *
 * @example
 * ```vue
 * <T i18nKey="welcome" :params="{ name: 'John' }" ns="forms" locale="fr" />
 *
 * <T i18nKey="welcome_link">
 *   <template #link="{ children }">
 *     <a href="/help">{{ children }}</a>
 *   </template>
 * </T>
 *
 * <T i18nKey="welcome_link" :components="{ link: { component: 'a', props: { href: '/help' } } }" />
 *
 * <T i18nKey="maybe.missing">Shown when the key has no translation</T>
 * ```
 */
export const T = /*@__PURE__*/ defineComponent({
  name: "T",
  props: {
    i18nKey: {
      type: String,
      required: true,
    },

    /** Merged with slot content. */
    params: {
      type: Object as PropType<Record<string, unknown>>,
      default: () => ({}),
    },

    ns: {
      type: String,
      default: undefined,
    },

    locale: {
      type: String,
      default: undefined,
    },

    /** Shown when the key is missing; without it the key itself is rendered. */
    fallback: {
      type: String,
      default: undefined,
    },

    /**
     * Skip post-processing — notably the invisible marker characters the
     * in-context editor injects.
     */
    raw: {
      type: Boolean,
      default: undefined,
    },

    /**
     * Tag-name → handler map for tag interpolation.
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

    // `prepareTranslation` wants the core-shaped imperative `hasTranslation`,
    // but VueI18n's returns a ComputedRef. Reactivity is carried by `tRaw`.
    const source: PrepareTranslationSource = {
      tRaw: (key, params) => i18n.tRaw(key, params),
      hasTranslation: (key, locale, namespace, checkFallbacks) =>
        i18n.hasTranslationNow(key, { locale, namespace, checkFallbacks }),
    };

    // Single-string arrays are flattened for template `{{ children }}`.
    const flattenChildren = (children: (string | VNode)[]) =>
      children.length === 1 && typeof children[0] === "string" ? children[0] : children;

    return () => {
      // Slots act as tag handlers too; `components` wins a name collision.
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

      // Parity with the react/solid/svelte wrappers' children fallback.
      const defaultSlot = slots.default;
      if (prepared.isMissing && defaultSlot) {
        return defaultSlot();
      }

      const content = prepared.content;
      if (typeof content === "string") {
        return content;
      }

      const pendingByMarker = new Map<string, PendingHandler>();
      for (const pending of prepared.pendingHandlers) {
        pendingByMarker.set(pending.marker, pending);
      }

      // Slot functions receive `{ children }`; Vue components receive them
      // through their default slot.
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
