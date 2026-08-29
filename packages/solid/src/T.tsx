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
// The PURE rich-text seam, NOT `@comvi/core/tags`: importing the tags entry
// would register tag syntax AMBIENTLY, so every app rendering `<T>` would also
// start parsing `<tag>` markup in plain string-API `t()`. `prepareTranslation`
// passes the tag extension per call, so the ambient switch stays the app's own.
import { prepareTranslation, type PendingHandler } from "@comvi/core/rich-text";
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

/**
 * Component handlers render through JSX rather than being invoked as bare
 * functions, so they get real Solid component semantics: their own owner,
 * context, and untracked setup.
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

export interface TProps {
  i18nKey: keyof TranslationKeys | PermissiveKey;
  params?: TranslationParams;
  ns?: string;
  locale?: string;
  /** Text shown when the translation is missing. Takes priority over children. */
  fallback?: string;
  /**
   * Skip post-processing — notably the invisible marker characters the
   * in-context editor injects.
   */
  raw?: boolean;
  /** Tag-name → handler map for tag interpolation. */
  components?: ComponentMap;
  /** Rendered when the key is missing and no `fallback` prop was given. */
  children?: JSX.Element;
}

/**
 * Renders a translation.
 *
 * @example
 * ```tsx
 * <T i18nKey="greeting" />
 * ```
 */
export const T: Component<TProps> = (props) => {
  const ctx = useI18nContextValue();

  // Fallback children resolve LAZILY: resolving eagerly would build the
  // fallback subtree — and run its side effects — on every render, translation
  // present or not. The `children()` helper is created once under the
  // component owner, so it survives memo recomputes and is disposed with the
  // component rather than churning on each recompute.
  const owner = getOwner();
  let resolveFallback: (() => ResolvedChildren) | undefined;
  const fallbackChildren = (): ResolvedChildren => {
    if (!resolveFallback) {
      resolveFallback = runWithOwner(owner, () => resolveChildren(() => props.children))!;
    }
    return resolveFallback();
  };

  const finalContent = createMemo(() => {
    ctx.signals.cacheRevision();
    const keyString = props.i18nKey as string;

    // The `??` short-circuits the signal read when `props.locale` is set, so
    // `<T locale="…">` does not recompute on unrelated global locale changes.
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

    // Fast path: a bare `tRaw` call keeps core's static-template cache hit
    // (zero per-render allocation) for the common shape — a plain-text template
    // rendered with nothing but the key.
    //
    // It cannot be unconditional. The tag grammar is handed over PER CALL, so a
    // template that still contains markup must go through `prepareTranslation`
    // to be parsed at all; `indexOf("<")` on the resolved string is what tells
    // the two apart. A non-string result is already structured.
    if (!hasComponents && !hasParams && !hasOverrides) {
      const content = ctx.i18n.tRaw(keyString as never);
      if (typeof content !== "string" || content.indexOf("<") === -1) {
        const isMissing =
          typeof content === "string" &&
          content === keyString &&
          !ctx.i18n.hasTranslation(keyString, targetLocale, targetNamespace, true);

        if (isMissing && props.children !== undefined) {
          return fallbackChildren();
        }

        return renderContent(content, NO_HANDLERS, reportTagError);
      }
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
