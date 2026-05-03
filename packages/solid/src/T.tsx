import { children as resolveChildren, type Component, type JSX, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useI18nContextValue } from "./context";
import { createElement as createVirtualElement } from "@comvi/core";
import type {
  TranslationParams,
  VirtualNode,
  TranslationResult,
  TagCallbackParams,
  TranslationKeys,
  PermissiveKey,
} from "@comvi/core";
import type { ComponentMap } from "./types";

const MARKER_PREFIX = "__solid_component_";
const MARKER_SUFFIX = "__";
type ReportTagError = (error: unknown, tagName: string) => void;

// ============ Helper functions ============

function childrenToArray(children: TranslationResult): (string | VirtualNode)[] {
  if (typeof children === "string") {
    return children ? [children] : [];
  }
  return children || [];
}

function buildTagHandlers(
  comps: ComponentMap,
  solidHandlers: Map<string, (children: JSX.Element) => JSX.Element>,
  reportTagError: ReportTagError,
): Record<string, (p: TagCallbackParams) => VirtualNode> {
  const handlers: Record<string, (p: TagCallbackParams) => VirtualNode> = {};
  for (const [tagName, mapping] of Object.entries(comps)) {
    if (typeof mapping === "string") {
      handlers[tagName] = ({ children }: TagCallbackParams) => {
        return createVirtualElement(mapping, {}, childrenToArray(children));
      };
    } else if (typeof mapping === "function") {
      solidHandlers.set(tagName, (children) => {
        try {
          return mapping({ children });
        } catch (error) {
          reportTagError(error, tagName);
          return <>{children}</>;
        }
      });
      handlers[tagName] = ({ children }: TagCallbackParams) => {
        return createVirtualElement(
          `${MARKER_PREFIX}${tagName}${MARKER_SUFFIX}`,
          {},
          childrenToArray(children),
        );
      };
    } else if (typeof mapping === "object" && mapping !== null) {
      if (typeof mapping.tag === "string") {
        handlers[tagName] = ({ children }: TagCallbackParams) => {
          return createVirtualElement(
            mapping.tag as string,
            mapping.props || {},
            childrenToArray(children),
          );
        };
      } else if (typeof mapping.tag === "function") {
        solidHandlers.set(tagName, (children) => {
          try {
            const Tag = mapping.tag as (props: any) => JSX.Element;
            return <Tag {...(mapping.props || {})}>{children}</Tag>;
          } catch (error) {
            reportTagError(error, tagName);
            return <>{children}</>;
          }
        });
        handlers[tagName] = ({ children }: TagCallbackParams) => {
          return createVirtualElement(
            `${MARKER_PREFIX}${tagName}${MARKER_SUFFIX}`,
            {},
            childrenToArray(children),
          );
        };
      }
    }
  }
  return handlers;
}

// ============ JSX Rendering Functions ============

/**
 * Renders a VirtualNode to JSX elements
 */
function renderNode(
  node: VirtualNode,
  solidHandlers: Map<string, (children: JSX.Element) => JSX.Element>,
  reportTagError: ReportTagError,
): JSX.Element {
  if (node.type === "text") {
    return <>{node.text}</>;
  }

  if (node.type === "fragment") {
    return <>{renderContent(node.children as TranslationResult, solidHandlers, reportTagError)}</>;
  }

  // Element node
  const tag = node.tag;
  const childResult = node.children as TranslationResult;

  if (tag.startsWith(MARKER_PREFIX) && tag.endsWith(MARKER_SUFFIX)) {
    const handlerName = tag.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length);
    const handler = solidHandlers.get(handlerName);
    if (handler) {
      try {
        return handler(renderContent(childResult, solidHandlers, reportTagError));
      } catch (error) {
        reportTagError(error, handlerName);
        return <>{renderContent(childResult, solidHandlers, reportTagError)}</>;
      }
    }
  }

  return (
    <Dynamic component={tag} {...(node.props || {})}>
      {renderContent(childResult, solidHandlers, reportTagError)}
    </Dynamic>
  );
}

/**
 * Renders TranslationResult (string or array) to JSX elements
 */
function renderContent(
  content: TranslationResult,
  solidHandlers: Map<string, (children: JSX.Element) => JSX.Element>,
  reportTagError: ReportTagError,
): JSX.Element {
  if (typeof content === "string") {
    return <>{content}</>;
  }

  if (!content || content.length === 0) {
    return <></>;
  }

  return (
    <>
      {content.map((item) =>
        typeof item === "string" ? item : renderNode(item, solidHandlers, reportTagError),
      )}
    </>
  );
}

// ============ Main Component ============

export interface TProps {
  /** The translation key to look up */
  i18nKey: keyof TranslationKeys | PermissiveKey;
  /** Optional parameters for interpolation */
  params?: TranslationParams;
  /** Override namespace for this translation */
  ns?: string;
  /** Override locale for this translation */
  locale?: string;
  /** Fallback text if translation is not found */
  fallback?: string;
  /** Skip post-processing if true */
  raw?: boolean;
  /** Component mapping for tag interpolation */
  components?: ComponentMap;
  /**
   * Fallback content if translation is not found.
   */
  children?: JSX.Element;
}

/**
 * Translation component for rendering translations with tag interpolation
 *
 * @example Basic usage
 * ```tsx
 * <T i18nKey="greeting" />
 * ```
 */
export const T: Component<TProps> = (props) => {
  const ctx = useI18nContextValue();
  const resolvedChildren = resolveChildren(() => props.children);

  const finalContent = createMemo(() => {
    // Access signals to track dependencies from the latest memoized signals
    const currentLocale = ctx.signals.locale();
    ctx.signals.cacheRevision();
    const keyString = props.i18nKey as string;

    const targetLocale = props.locale ?? currentLocale;
    const targetNamespace = props.ns ?? ctx.signals.defaultNamespace();
    const translationExists = ctx.i18n.hasTranslation(
      keyString,
      targetLocale,
      targetNamespace,
      true,
    );

    const reportTagError: ReportTagError = (error, tagName) => {
      ctx.i18n.reportError(error, { source: "translation", tagName });
    };

    const solidHandlers = new Map<string, (children: JSX.Element) => JSX.Element>();
    const tagHandlers = props.components
      ? buildTagHandlers(props.components, solidHandlers, reportTagError)
      : undefined;
    const hasTagHandlers = tagHandlers !== undefined && Object.keys(tagHandlers).length > 0;
    const hasParams = props.params !== undefined && Object.keys(props.params).length > 0;
    const hasOverrides =
      props.ns !== undefined ||
      props.locale !== undefined ||
      props.fallback !== undefined ||
      props.raw !== undefined;

    const content: TranslationResult =
      !hasTagHandlers && !hasParams && !hasOverrides
        ? ctx.i18n.tRaw(keyString as any)
        : (() => {
            const transportParams: TranslationParams = {};
            if (hasParams) {
              Object.assign(transportParams, props.params);
            }
            if (hasTagHandlers) {
              Object.assign(transportParams, tagHandlers);
            }
            if (props.ns !== undefined) {
              transportParams.ns = props.ns;
            }
            if (props.locale !== undefined) {
              transportParams.locale = props.locale;
            }
            if (props.fallback !== undefined) {
              transportParams.fallback = props.fallback;
            }
            if (props.raw !== undefined) {
              transportParams.raw = props.raw;
            }
            return ctx.i18n.tRaw(keyString as any, transportParams);
          })();

    const isMissingTranslation =
      !translationExists &&
      props.fallback === undefined &&
      typeof content === "string" &&
      content === keyString;

    if (isMissingTranslation && props.children !== undefined) {
      return resolvedChildren();
    }

    return renderContent(content, solidHandlers, reportTagError);
  });

  return <>{finalContent()}</>;
};
