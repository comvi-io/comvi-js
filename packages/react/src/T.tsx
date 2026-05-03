import React from "react";
import { useI18n } from "./useI18n";
import { isVirtualNode } from "./utils";
import type {
  TranslationParams,
  TagCallbackParams,
  VirtualNode,
  TranslationResult,
  PermissiveKey,
} from "@comvi/core";
import { createElement as createVirtualElement } from "@comvi/core";

/**
 * Marker prefix for React component handling in tag interpolation
 * Used to identify VirtualNodes that should be converted to React elements
 */
const MARKER_PREFIX = "__react_component_";
const MARKER_SUFFIX = "__";

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

type TranslationKeysMap = import("@comvi/core").TranslationKeys;
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
/**
 * Convert TranslationResult children to format suitable for tag handler
 */
function childrenToArray(children: TranslationResult): (string | VirtualNode)[] {
  if (typeof children === "string") {
    return children ? [children] : [];
  }
  return Array.isArray(children) ? children : [];
}

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
      t(key as any, params) as unknown as TranslationResult);

  // Remove 'components' from restProps to avoid passing it as a translation param
  const { components: _, ...cleanRestProps } = restProps as {
    components?: ComponentsMap;
    [key: string]: unknown;
  };

  // Store React handlers for later rendering
  const reactHandlers = new Map<string, (children: React.ReactNode[]) => React.ReactElement>();
  const tagHandlers: Record<string, (params: TagCallbackParams) => VirtualNode | string> = {};

  // Register a React handler with its marker tag handler
  const registerHandler = (
    tagName: string,
    reactHandler: (children: React.ReactNode[]) => React.ReactElement,
  ) => {
    reactHandlers.set(tagName, (children) => {
      try {
        return reactHandler(children);
      } catch (error) {
        reportError(error, { source: "translation", tagName });
        return <>{children}</>;
      }
    });
    tagHandlers[tagName] = ({ children }: TagCallbackParams) =>
      createVirtualElement(
        `${MARKER_PREFIX}${tagName}${MARKER_SUFFIX}`,
        {},
        childrenToArray(children),
      );
  };

  if (components) {
    for (const [tagName, handler] of Object.entries(components)) {
      if (typeof handler === "string") {
        tagHandlers[tagName] = ({ children }: TagCallbackParams) =>
          createVirtualElement(handler, {}, childrenToArray(children));
      } else if (React.isValidElement(handler)) {
        registerHandler(tagName, (children) => React.cloneElement(handler, undefined, ...children));
      } else if (typeof handler === "function") {
        registerHandler(tagName, (children) => handler({ children: <>{children}</> }));
      }
    }
  }

  // Merge explicit params with rest props and tag handlers
  const allParams = { ...params, ...cleanRestProps, ...tagHandlers };

  const keyString = String(i18nKey);
  const targetLocale = locale ?? currentLocale;
  const targetNamespace = ns ?? getDefaultNamespace();
  const translationExists = hasTranslation(keyString, targetLocale, targetNamespace, true);

  // Get translated content
  const transportParams: TranslationParams = { ...(allParams as TranslationParams) };
  if (ns !== undefined) {
    transportParams.ns = ns;
  }
  if (locale !== undefined) {
    transportParams.locale = locale;
  }
  if (fallback !== undefined) {
    transportParams.fallback = fallback;
  }
  if (raw !== undefined) {
    transportParams.raw = raw;
  }

  const content = translate(keyString as any, transportParams);

  // Use children as fallback if translation is missing and no explicit fallback provided
  // Priority: translation (including processed fallback/onMissing) > children fallback > key
  const isMissingTranslation =
    !translationExists &&
    fallback === undefined &&
    typeof content === "string" &&
    content === keyString;
  const finalContent = isMissingTranslation && children !== undefined ? children : content;

  // Handle different content types
  if (typeof finalContent === "string") {
    return <>{finalContent}</>;
  }

  // If children was used as fallback and it's not an array, return it directly
  if (finalContent === children) {
    return <>{children}</>;
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

    // Check for React component marker
    if (tag.startsWith(MARKER_PREFIX) && tag.endsWith(MARKER_SUFFIX)) {
      const handlerName = tag.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length);
      const handler = reactHandlers.get(handlerName);
      if (handler) {
        try {
          return React.cloneElement(handler(convertedChildren), { key: reactKey });
        } catch (error) {
          reportError(error, { source: "translation", tagName: handlerName });
          return <React.Fragment key={`${keyString}-${index}`}>{convertedChildren}</React.Fragment>;
        }
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
