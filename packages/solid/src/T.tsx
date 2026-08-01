// Ambient tag-syntax registration for string-API convenience (plan §1.2).
// <T> itself does NOT depend on it: prepareTranslation passes the tag
// extension per call (the bare-tRaw fast path below is covered by this
// ambient registration — see the fast-path comment).
import "@comvi/core/tags";
import {
  children as resolveChildren,
  type Component,
  type JSX,
  type ResolvedChildren,
  createMemo,
  getOwner,
  runWithOwner,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { useI18nContextValue } from "./context";
import { prepareTranslation, type PendingHandler } from "@comvi/core/tags";
import type {
  TranslationParams,
  VirtualNode,
  TranslationResult,
  TranslationKeys,
  PermissiveKey,
} from "@comvi/core";
import type { ComponentMap } from "./types";

type ReportTagError = (error: unknown, tagName: string) => void;

/** Marker tag → JSX handler resolved from `pendingHandlers`. */
type MarkerHandlers = Map<string, (children: JSX.Element) => JSX.Element>;

const NO_HANDLERS: MarkerHandlers = new Map();

// ============ Helper functions ============

/**
 * Resolve the opaque handlers `prepareTranslation` transported as marker
 * nodes into Solid render functions. Component handlers render through JSX
 * (createComponent) so they run with proper Solid component semantics (own
 * owner, context, untracked setup) instead of being invoked as bare functions.
 */
function buildMarkerHandlers(
  pendingHandlers: PendingHandler[],
  reportTagError: ReportTagError,
): MarkerHandlers {
  const handlers: MarkerHandlers = new Map();
  for (const pending of pendingHandlers) {
    const target = pending.handler;
    if (typeof target === "function") {
      const Comp = target as (props: Record<string, unknown>) => JSX.Element;
      handlers.set(pending.marker, (children) => {
        try {
          return <Comp {...(pending.props ?? {})}>{children}</Comp>;
        } catch (error) {
          reportTagError(error, pending.name);
          return <>{children}</>;
        }
      });
    } else {
      // Non-invokable opaque handler — degrade to the tag's children.
      handlers.set(pending.marker, (children) => <>{children}</>);
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
  markerHandlers: MarkerHandlers,
  reportTagError: ReportTagError,
): JSX.Element {
  if (node.type === "text") {
    return <>{node.text}</>;
  }

  if (node.type === "fragment") {
    return <>{renderContent(node.children as TranslationResult, markerHandlers, reportTagError)}</>;
  }

  // Element node
  const tag = node.tag;
  const childResult = node.children as TranslationResult;

  const handler = markerHandlers.get(tag);
  if (handler) {
    return handler(renderContent(childResult, markerHandlers, reportTagError));
  }

  return (
    <Dynamic component={tag} {...(node.props || {})}>
      {renderContent(childResult, markerHandlers, reportTagError)}
    </Dynamic>
  );
}

/**
 * Renders TranslationResult (string or array) to JSX elements
 */
function renderContent(
  content: TranslationResult,
  markerHandlers: MarkerHandlers,
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
        typeof item === "string" ? item : renderNode(item, markerHandlers, reportTagError),
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

  // Resolve fallback children lazily — only when a translation is actually
  // missing. Resolving eagerly here would create (and run side effects in) the
  // fallback subtree on every render even when the translation exists. The
  // `children()` helper is created once, under the component owner via
  // `runWithOwner`, so it survives memo recomputes and is disposed with the
  // component (not recreated/disposed on each recompute, which would churn).
  const owner = getOwner();
  let resolveFallback: (() => ResolvedChildren) | undefined;
  const fallbackChildren = (): ResolvedChildren => {
    if (!resolveFallback) {
      resolveFallback = runWithOwner(owner, () => resolveChildren(() => props.children))!;
    }
    return resolveFallback();
  };

  const finalContent = createMemo(() => {
    // Access signals to track dependencies from the latest memoized signals.
    ctx.signals.cacheRevision();
    const keyString = props.i18nKey as string;

    // Only subscribe to the global locale signal when no explicit locale is
    // pinned, so <T locale="…"> does not recompute on unrelated global locale
    // changes (the `??` short-circuits the signal read when props.locale is set).
    const targetLocale = props.locale ?? ctx.signals.locale();
    const targetNamespace = props.ns ?? ctx.signals.defaultNamespace();

    const reportTagError: ReportTagError = (error, tagName) => {
      ctx.i18n.reportError(error, { source: "translation", tagName });
    };

    const hasComponents =
      props.components !== undefined && Object.keys(props.components).length > 0;
    const hasParams = props.params !== undefined && Object.keys(props.params).length > 0;
    const hasOverrides =
      props.ns !== undefined ||
      props.locale !== undefined ||
      props.fallback !== undefined ||
      props.raw !== undefined;

    // Fine-grained fast path: a bare tRaw call keeps core's static-template
    // cache hit (zero per-render allocation). Tag templates without handlers
    // rely on the ambient registration performed by this module's
    // `import "@comvi/core/tags"` (a tag-bearing template is never "static"
    // under the ambient tag extension bits, so it still parses correctly).
    if (!hasComponents && !hasParams && !hasOverrides) {
      const content = ctx.i18n.tRaw(keyString as never);
      const isMissing =
        typeof content === "string" &&
        content === keyString &&
        !ctx.i18n.hasTranslation(keyString, targetLocale, targetNamespace, true);

      if (isMissing && props.children !== undefined) {
        return fallbackChildren();
      }

      return renderContent(content, NO_HANDLERS, reportTagError);
    }

    const { content, pendingHandlers, isMissing } = prepareTranslation(ctx.i18n, {
      i18nKey: keyString,
      params: props.params,
      ns: props.ns,
      locale: props.locale,
      fallback: props.fallback,
      raw: props.raw,
      components: props.components,
    });

    if (isMissing && props.children !== undefined) {
      return fallbackChildren();
    }

    return renderContent(
      content,
      buildMarkerHandlers(pendingHandlers, reportTagError),
      reportTagError,
    );
  });

  return <>{finalContent()}</>;
};
