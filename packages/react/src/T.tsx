import React from "react";
import { useI18n } from "./useI18n";
import { isVirtualNode } from "@comvi/core";
import type {
  TranslationParams,
  TranslationKeys,
  VirtualNode,
  PermissiveKey,
  TranslationResult,
} from "@comvi/core";
// The PURE rich-text seam, NOT `@comvi/core/tags`: importing the tags entry
// would register tag syntax AMBIENTLY, so every app rendering `<T>` would also
// start parsing `<tag>` markup in plain string-API `t()`. `prepareTranslation`
// passes the tag extension per call, so the ambient switch stays the app's own.
import {
  prepareTranslation,
  type PendingHandler,
  type TagComponentConfig,
} from "@comvi/core/rich-text";

/** What a tag can resolve to in React. */
type ComponentTarget =
  | string // HTML tag name: "strong", "em", etc.
  | React.ReactElement // React element - children auto-injected
  | ((params: { children: React.ReactNode }) => React.ReactElement); // Function handler

/**
 * A config entry's target. Looser than `ComponentTarget` on purpose: the
 * entry's own `props` supply whatever the component needs beyond `children`,
 * so a component with REQUIRED extra props belongs here — the bare-handler
 * signature would reject it by contravariance, which is precisely the case
 * `props` exists to serve.
 */
type ComponentConfigTarget =
  | string // HTML tag name: "strong", "em", etc.
  | React.ReactElement // React element - `props` merged over its own
  | ((props: any) => React.ReactElement); // Function handler fed from `props`

/**
 * Core's `{ tag | component, props }` entry form, narrowed to React targets.
 * `tag` (solid/svelte convention) and `component` (vue convention) are
 * aliases; `props` is merged into the resolved handler. Intersecting core's
 * own `TagComponentConfig` keeps the field set from drifting away from the
 * `prepareTranslation` pipeline that actually reads it; requiring ONE of the
 * two spellings keeps the guarantee core's all-optional shape gives up, since
 * an entry with neither is not a config at all — `isTagComponentConfig`
 * rejects it and the object is passed on as an opaque handler.
 */
type ComponentConfig = TagComponentConfig &
  (
    | { tag: ComponentConfigTarget; component?: ComponentConfigTarget }
    | { component: ComponentConfigTarget; tag?: ComponentConfigTarget }
  );

type ComponentHandler = ComponentTarget | ComponentConfig;

type ComponentsMap = Record<string, ComponentHandler>;

interface TBaseProps {
  ns?: string;

  locale?: string;

  /** Interpolation parameters; the same values may be passed as direct props. */
  params?: TranslationParams;

  /** Text shown when the translation is missing. Takes priority over children. */
  fallback?: string;

  /**
   * Skip post-processing — notably the invisible marker characters the
   * in-context editor injects.
   */
  raw?: boolean;

  /** Rendered when the key is missing and no `fallback` prop was given. */
  children?: React.ReactNode;

  /**
   * Tag-name → handler map for tag interpolation.
   *
   * @example
   * {
   *   bold: <strong />,                    // React element - children injected
   *   link: <a href="/help" />,            // Props preserved
   *   btn: ({ children }) => <button>{children}</button>  // Function handler
   * }
   */
  components?: ComponentsMap;
}

type TranslationKeysMap = TranslationKeys;
type TypedKey = keyof TranslationKeysMap;

type KeyRequiredParams<K extends TypedKey> = TranslationKeysMap[K] extends never
  ? never
  : TranslationKeysMap[K] & TranslationParams;

type TypedTProps<K extends TypedKey> =
  KeyRequiredParams<K> extends never
    ? TBaseProps & { i18nKey: K } & Record<string, unknown>
    :
        | (TBaseProps & { i18nKey: K; params: KeyRequiredParams<K> } & Record<string, unknown>)
        | (TBaseProps & { i18nKey: K } & KeyRequiredParams<K> & Record<string, unknown>);

type StrictTypedProps = [TypedKey] extends [never]
  ? never
  : { [K in TypedKey]: TypedTProps<K> }[TypedKey];

type PermissiveTProps = [TypedKey] extends [never]
  ? TBaseProps & { i18nKey: PermissiveKey } & Record<string, unknown>
  : never;

/**
 * For a key with required params, provide either `params={{ ...required }}` or
 * direct props carrying the required fields (`<T i18nKey="x" count={1} />`).
 */
export type TProps = StrictTypedProps | PermissiveTProps;

/**
 * Renders a translation. Params may be React nodes, and a `<T>` child is the
 * fallback for a missing key.
 *
 * @example
 * ```tsx
 * <T i18nKey="welcome" name={<strong>{userName}</strong>} />
 * <T i18nKey="button.submit" ns="forms" locale="fr" />
 * <T i18nKey="missing.key">Fallback Text</T>
 * ```
 */
const TComponent = function T({
  i18nKey,
  ns,
  locale,
  params = {},
  fallback,
  raw,
  children,
  components,
  ...restProps
}: TProps) {
  const {
    t,
    tRaw,
    locale: currentLocale,
    hasTranslation,
    getDefaultNamespace,
    reportError,
  } = useI18n();

  const translate =
    tRaw ??
    ((key: string, params?: TranslationParams) =>
      t(key as never, params) as unknown as TranslationResult);

  // Peeled off restProps so it is never passed as a translation param.
  const { components: _, ...cleanRestProps } = restProps as {
    components?: ComponentsMap;
    [key: string]: unknown;
  };

  const keyString = String(i18nKey);

  // Direct props take precedence over same-named `params` entries.
  const allParams = { ...params, ...cleanRestProps } as TranslationParams;

  // Transports opaque React handlers as marker nodes and passes the tag syntax
  // extension per call.
  const { content, pendingHandlers, isMissing } = prepareTranslation(
    {
      tRaw: translate,
      // Default the lookup to the React-tracked render locale / default
      // namespace so missing-translation detection matches what `translate`
      // resolves against (not the mutable instance locale).
      hasTranslation: (key, lookupLocale, lookupNs, checkFallbacks) =>
        hasTranslation(
          key,
          lookupLocale ?? currentLocale,
          lookupNs ?? getDefaultNamespace(),
          checkFallbacks,
        ),
    },
    { i18nKey: keyString, params: allParams, ns, locale, fallback, raw, components },
  );

  // Priority: translation (including a processed fallback/onMissing) > children
  // > the key itself.
  const finalContent = isMissing && children !== undefined ? children : content;

  if (typeof finalContent === "string") {
    return <>{finalContent}</>;
  }

  if (finalContent === children) {
    return <>{children}</>;
  }

  // Marker lookup for the opaque handlers `prepareTranslation` transported.
  const pendingByMarker = new Map<string, PendingHandler>();
  for (const pending of pendingHandlers) {
    pendingByMarker.set(pending.marker, pending);
  }

  // Children can hold raw React nodes at runtime (`<bold>{name}</bold>` with
  // `name={<em/>}`), so non-VirtualNode values must survive the conversion.
  const convertChildren = (childResult: unknown): React.ReactNode[] => {
    if (!Array.isArray(childResult)) {
      return childResult == null ? [] : [childResult as React.ReactNode];
    }

    return childResult.map((child, index) => {
      if (isVirtualNode(child)) {
        return convertNode(child, index);
      }
      return child as React.ReactNode;
    });
  };

  // Throws when a function handler returns a non-element; the caller reports it.
  const resolvePending = (
    pending: PendingHandler,
    convertedChildren: React.ReactNode[],
  ): React.ReactNode => {
    const handler = pending.handler;

    if (React.isValidElement(handler)) {
      const baseProps = handler.props as Record<string, unknown>;
      const mergedProps = pending.props ? { ...baseProps, ...pending.props } : baseProps;
      return React.createElement(handler.type, mergedProps, ...convertedChildren);
    }

    if (typeof handler === "function") {
      const result = (handler as (params: { children: React.ReactNode }) => React.ReactElement)({
        ...(pending.props ?? {}),
        children: <>{convertedChildren}</>,
      });
      if (!React.isValidElement(result)) {
        throw new Error(`Tag handler for "${pending.name}" must return a React element`);
      }
      return result;
    }

    // Non-invokable opaque handler — degrade to the tag's children.
    return convertedChildren;
  };

  const convertNode = (node: VirtualNode, index: number): React.ReactElement => {
    if (node.type === "text") {
      return <React.Fragment key={`${keyString}-${index}`}>{node.text}</React.Fragment>;
    }

    if (node.type === "fragment") {
      const convertedChildren = convertChildren(node.children);
      return (
        <React.Fragment key={node.key ?? `${keyString}-${index}`}>
          {convertedChildren}
        </React.Fragment>
      );
    }

    const tag = node.tag;
    const reactKey = node.key ?? `${keyString}-${index}`;
    const childResult = node.children;

    const convertedChildren = convertChildren(childResult);

    const pending = pendingByMarker.get(tag);
    if (pending) {
      try {
        const result = resolvePending(pending, convertedChildren);
        return <React.Fragment key={reactKey}>{result}</React.Fragment>;
      } catch (error) {
        reportError(error, { source: "translation", tagName: pending.name });
        return <React.Fragment key={`${keyString}-${index}`}>{convertedChildren}</React.Fragment>;
      }
    }

    return React.createElement(tag, { ...node.props, key: reactKey }, ...convertedChildren);
  };

  const resultArray = finalContent as Array<string | VirtualNode | React.ReactNode>;
  return (
    <>
      {resultArray.map((item, index) => {
        if (isVirtualNode(item)) {
          return convertNode(item, index);
        }
        return (
          <React.Fragment key={`${keyString}-${index}`}>{item as React.ReactNode}</React.Fragment>
        );
      })}
    </>
  );
};

// Without /*@__PURE__*/ the top-level `React.memo(...)` call is an unremovable
// side effect, pinning the component — and the `@comvi/core/rich-text` pipeline
// behind it — into apps that never render `<T>`.
export const T = /*@__PURE__*/ React.memo(TComponent) as React.NamedExoticComponent<TProps>;

T.displayName = "T";
