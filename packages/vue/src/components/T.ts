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
  isVirtualNode,
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

/**
 * Tag-name → handler map for `<T>`'s tag interpolation: an HTML tag name, a
 * Vue component, or a `{ tag | component, props }` config. The same name in all
 * four bindings, so a `components` map can be typed.
 */
export type ComponentMap = Record<string, ComponentHandler>;

/**
 * Renders a translation. Named slots and the `components` prop both act as tag
 * handlers; the default slot is the fallback for a missing key.
 *
 * @example
 * ```vue
 * <T i18nKey="welcome" :params="{ name: 'John' }" ns="forms" locale="fr" />
 *
 * <!-- Params may also be written as plain attributes. -->
 * <T i18nKey="cart.items" :count="2" name="John" />
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
const TComponent = /*@__PURE__*/ defineComponent({
  name: "T",

  // Anything that is not a declared prop is an interpolation param, so no
  // attribute may fall through to the rendered markup.
  inheritAttrs: false,

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
     * `false` turns the in-context editor's invisible markers off for this call. Use it when
     * they cause a problem: a comparison or sort that sees extra characters, a width-sensitive
     * layout, a canvas or library that counts characters. Nothing else reads it; the string
     * is then not editable in context.
     */
    markers: {
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
      type: Object as PropType<ComponentMap>,
      default: undefined,
    },
  },

  setup(props, { slots, attrs }) {
    const i18n = inject(I18N_INJECTION_KEY);

    if (!i18n) {
      throw new Error(
        "[@comvi/vue] <T> component must be used within a Vue app with i18n plugin installed",
      );
    }

    // `prepareTranslation` wants the core-shaped imperative `hasTranslation`,
    // but VueI18n's returns a ComputedRef. Reactivity is carried by `tRaw`.
    const source: PrepareTranslationSource = {
      // `as never` because the key is a RUNTIME string: once an app closes
      // `TranslationKeys`, `tRaw`'s overloads narrow their key parameter to
      // the registered literals (and `never` for the namespaced overload), so
      // an unconstrained `string` matches none of them and every key-closed
      // program fails to build. Same idiom as `solid`'s `tRaw(keyString as
      // never)` and `react`'s `t(key as never, params)`.
      tRaw: (key, params) => i18n.tRaw(key as never, params),
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

      // Every undeclared attribute is an interpolation param, matching the
      // react wrapper: `<T i18nKey="cart" :count="2" />` is `params: { count: 2 }`.
      // A direct prop wins a name collision with `params`, again as in react.
      // Declared props (`ns`, `locale`, `fallback`, `markers`,
      // `components`, `params`, `i18nKey`) never reach `attrs`, so they
      // cannot leak in here.
      const params = props.params as TranslationParams;
      const allParams =
        Object.keys(attrs).length === 0 ? params : ({ ...params, ...attrs } as TranslationParams);

      const prepared = prepareTranslation(source, {
        i18nKey: props.i18nKey,
        params: allParams,
        ns: props.ns,
        locale: props.locale,
        fallback: props.fallback,
        markers: props.markers,
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
        // Not a node the library built, so it is data and renders as text. A
        // param is whatever the app was handed, and an object parsed from JSON
        // can be shaped like a node; it cannot carry core's brand.
        if (!isVirtualNode(node)) return String(node);

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

/**
 * `<T>` with the direct-param props opened up: any attribute that is not one
 * of the declared props is an interpolation param at runtime, so the type has
 * to accept it. Same widening as the react wrapper's `TProps`.
 */
export const T = TComponent as typeof TComponent & {
  new (...args: ConstructorParameters<typeof TComponent>): InstanceType<typeof TComponent> & {
    $props: InstanceType<typeof TComponent>["$props"] & Record<string, unknown>;
  };
};
