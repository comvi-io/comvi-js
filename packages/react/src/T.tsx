// Ambient tag-syntax registration for string-API convenience (plan §1.2).
// <T> itself does NOT depend on it: prepareTranslation passes the tag
// extension per call.
import "@comvi/core/tags";
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
import { prepareTranslation, type PendingHandler } from "@comvi/core/tags";

/**
 * Component handler types for the `components` prop
 */
type ComponentHandler =
  | string // HTML tag name: "strong", "em", etc.
  | React.ReactElement // React element - children auto-injected
  | ((params: { children: React.ReactNode }) => React.ReactElement); // Function handler

/**
 * Components prop type for tag interpolation
 */
type ComponentsMap = Record<string, ComponentHandler>;

/**
 * Base props shared by all key modes
 */
interface TBaseProps {
  /**
   * Namespace to use (optional)
   */
  ns?: string;

  /**
   * Specific locale to use (optional)
   */
  locale?: string;

  /**
   * Parameters for interpolation
   * Can also be passed as direct props
   */
  params?: TranslationParams;

  /**
   * Explicit fallback text to display if translation is missing (optional)
   * Takes priority over children fallback
   */
  fallback?: string;

  /**
   * Skip post-processing (optional)
   * When true, prevents post-processors like IncontextEditor from adding invisible marker characters
   */
  raw?: boolean;

  /**
   * Fallback content to display if translation is missing (optional)
   * Will be rendered if the translation key is not found and no fallback prop is provided
   */
  children?: React.ReactNode;

  /**
   * Components map for tag interpolation (optional)
   * Maps tag names to their handlers (React element or function)
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
 * Props for the T component
 * For required params keys, provide either:
 * - `params={{ ...required }}` OR
 * - direct props with required fields (e.g. `<T i18nKey="x" count={1} />`)
 */
export type TProps = StrictTypedProps | PermissiveTProps;

/**
 * Translation component for React
 * Renders translated content with support for dynamic parameters via props
 *
 * @example
 * ```tsx
 * // Simple usage
 * <T i18nKey="greeting" />
 *
 * // With parameters
 * <T i18nKey="welcome" name="John" />
 *
 * // With params object
 * <T i18nKey="welcome" params={{ name: "John" }} />
 *
 * // With React components as parameters
 * <T
 *   i18nKey="greeting"
 *   name={<strong>{userName}</strong>}
 * />
 *
 * // With specific namespace
 * <T i18nKey="button.submit" ns="forms" />
 *
 * // With specific locale
 * <T i18nKey="greeting" locale="fr" />
 *
 * // With fallback content
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

  // Remove 'components' from restProps to avoid passing it as a translation param
  const { components: _, ...cleanRestProps } = restProps as {
    components?: ComponentsMap;
    [key: string]: unknown;
  };

  const keyString = String(i18nKey);

  // Direct props take precedence over same-named `params` entries.
  const allParams = { ...params, ...cleanRestProps } as TranslationParams;

  // Shared <T> pipeline: transports opaque React handlers as marker nodes and
  // passes the tag syntax extension per call.
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

  // Use children as fallback if translation is missing and no explicit fallback provided
  // Priority: translation (including processed fallback/onMissing) > children fallback > key
  const finalContent = isMissing && children !== undefined ? children : content;

  // Handle different content types
  if (typeof finalContent === "string") {
    return <>{finalContent}</>;
  }

  // If children was used as fallback and it's not an array, return it directly
  if (finalContent === children) {
    return <>{children}</>;
  }

  // Only allocate the marker lookup when opaque handlers are in play.
  let pendingByMarker: Map<string, PendingHandler> | null = null;
  if (pendingHandlers.length > 0) {
    pendingByMarker = new Map();
    for (const pending of pendingHandlers) {
      pendingByMarker.set(pending.marker, pending);
    }
  }

  // Helper to convert VirtualNode children to React nodes (recursively handles markers)
  // Runtime can include raw React nodes here (e.g., <bold>{name}</bold> with name={<em/>}),
  // so we must preserve non-VirtualNode values.
  const convertChildren = (childResult: unknown): React.ReactNode[] => {
    if (typeof childResult === "string") {
      return childResult ? [childResult] : [];
    }

    if (!Array.isArray(childResult)) {
      return childResult == null ? [] : [childResult as React.ReactNode];
    }

    return childResult.map((child, index) => {
      if (typeof child === "string") {
        return child;
      }
      if (isVirtualNode(child)) {
        return convertNode(child, index);
      }
      return child as React.ReactNode;
    });
  };

  // Resolve an opaque handler against the converted tag children.
  // Throws when a function handler returns a non-element (reported by caller).
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

  // Helper to convert VirtualNode to React element, handling markers
  const convertNode = (node: VirtualNode, index: number): React.ReactElement => {
    // Handle text nodes
    if (node.type === "text") {
      return <React.Fragment key={`${keyString}-${index}`}>{node.text}</React.Fragment>;
    }

    // Handle fragment nodes
    if (node.type === "fragment") {
      const convertedChildren = convertChildren(node.children);
      return (
        <React.Fragment key={node.key ?? `${keyString}-${index}`}>
          {convertedChildren}
        </React.Fragment>
      );
    }

    // Element node
    const tag = node.tag;
    const reactKey = node.key ?? `${keyString}-${index}`;
    const childResult = node.children;

    // Always convert children first (handles nested markers)
    const convertedChildren = convertChildren(childResult);

    // Check for handler-transport marker
    const pending = pendingByMarker?.get(tag);
    if (pending) {
      try {
        const result = resolvePending(pending, convertedChildren);
        return <React.Fragment key={reactKey}>{result}</React.Fragment>;
      } catch (error) {
        reportError(error, { source: "translation", tagName: pending.name });
        return <React.Fragment key={`${keyString}-${index}`}>{convertedChildren}</React.Fragment>;
      }
    }

    // Regular ElementNode - convert to React element
    return React.createElement(tag, { ...node.props, key: reactKey }, ...convertedChildren);
  };

  // Convert result array to React nodes
  const resultArray = finalContent as Array<string | VirtualNode | React.ReactNode>;
  return (
    <>
      {resultArray.map((item, index) => {
        if (typeof item === "string") {
          return <React.Fragment key={`${keyString}-${index}`}>{item}</React.Fragment>;
        }
        // Check if it's a VirtualNode (from tag interpolation) or a React element (from ICU params)
        if (isVirtualNode(item)) {
          return convertNode(item, index);
        }
        // React element passed directly through ICU interpolation
        return (
          <React.Fragment key={`${keyString}-${index}`}>{item as React.ReactNode}</React.Fragment>
        );
      })}
    </>
  );
};

export const T = React.memo(TComponent) as React.NamedExoticComponent<TProps>;

// Add display name for React DevTools
T.displayName = "T";
