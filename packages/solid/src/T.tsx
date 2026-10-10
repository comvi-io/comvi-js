import {
  children as resolveChildren,
  type Component,
  type JSX,
  type ResolvedChildren,
  createMemo,
  getOwner,
  runWithOwner,
  splitProps,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { useI18nContextValue } from "./context";
// The PURE rich-text seam, NOT `@comvi/core/tags`: importing the tags entry
// would register tag syntax AMBIENTLY, so every app rendering `<T>` would also
// start parsing `<tag>` markup in plain string-API `t()`. `prepareTranslation`
// passes the tag extension per call, so the ambient switch stays the app's own.
import { isVirtualNode, prepareTranslation, type PendingHandler } from "@comvi/core/rich-text";
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
  // Not a node the library built, so it is data and renders as text. A param
  // is whatever the app was handed, and an object parsed from JSON can be
  // shaped like a node; it cannot carry core's brand.
  if (!isVirtualNode(node)) {
    return String(node);
  }

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

interface TBaseProps {
  i18nKey: keyof TranslationKeys | PermissiveKey;
  params?: TranslationParams;
  ns?: string;
  locale?: string;
  /** Text shown when the translation is missing. Takes priority over children. */
  fallback?: string;
  /**
   * `false` turns the in-context editor's invisible markers off for this call. Use it when
   * they cause a problem: a comparison or sort that sees extra characters, a width-sensitive
   * layout, a canvas or library that counts characters. Nothing else reads it; the string
   * is then not editable in context.
   */
  markers?: boolean;
  /** Tag-name → handler map for tag interpolation. */
  components?: ComponentMap;
  /** Rendered when the key is missing and no `fallback` prop was given. */
  children?: JSX.Element;
}

/**
 * Every prop that is not declared above is an interpolation param, so the type
 * has to accept a key it never declared — the same widening `@comvi/react`'s
 * `TProps` has.
 */
export type TProps = TBaseProps & Record<string, unknown>;

/** The props that carry their own meaning; everything else is a param. */
const DECLARED_PROPS = [
  "i18nKey",
  "params",
  "ns",
  "locale",
  "fallback",
  "markers",
  "components",
  "children",
] as const;

/**
 * Renders a translation.
 *
 * Params may be written as `params={{ … }}` or as direct props.
 *
 * @example
 * ```tsx
 * <T i18nKey="greeting" />
 * <T i18nKey="cart.items" count={2} name="Ada" />
 * ```
 */
export const T: Component<TProps> = (props) => {
  const ctx = useI18nContextValue();

  // Everything outside `DECLARED_PROPS` is an interpolation param, matching the
  // react wrapper: `<T i18nKey="cart" count={2} />` is `params: { count: 2 }`.
  const [local, directParams] = splitProps(props, DECLARED_PROPS);

  // Fallback children resolve LAZILY: resolving eagerly would build the
  // fallback subtree — and run its side effects — on every render, translation
  // present or not. The `children()` helper is created once under the
  // component owner, so it survives memo recomputes and is disposed with the
  // component rather than churning on each recompute.
  const owner = getOwner();
  let resolveFallback: (() => ResolvedChildren) | undefined;
  const fallbackChildren = (): ResolvedChildren => {
    if (!resolveFallback) {
      resolveFallback = runWithOwner(owner, () => resolveChildren(() => local.children))!;
    }
    return resolveFallback();
  };

  const finalContent = createMemo(() => {
    ctx.signals.cacheRevision();
    const keyString = local.i18nKey as string;

    // The `??` short-circuits the signal read when `local.locale` is set, so
    // `<T locale="…">` does not recompute on unrelated global locale changes.
    const targetLocale = local.locale ?? ctx.signals.locale();
    const targetNamespace = local.ns ?? ctx.signals.defaultNamespace();

    const reportTagError: ReportTagError = (error, tagName) => {
      ctx.i18n.reportError(error, { source: "translation", tagName });
    };

    // The spread is what SUBSCRIBES to each direct param, so it happens inside
    // the memo. A direct prop wins a name collision with `params`, as in react.
    const hasDirectParams = Object.keys(directParams).length > 0;
    const allParams = hasDirectParams
      ? ({ ...local.params, ...directParams } as TranslationParams)
      : local.params;

    const hasComponents =
      local.components !== undefined && Object.keys(local.components).length > 0;
    const hasParams = allParams !== undefined && Object.keys(allParams).length > 0;
    const hasOverrides =
      local.ns !== undefined ||
      local.locale !== undefined ||
      local.fallback !== undefined ||
      local.markers === false;

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

        if (isMissing && local.children !== undefined) {
          return fallbackChildren();
        }

        return renderContent(content, NO_HANDLERS, reportTagError);
      }
    }

    const { content, pendingHandlers, isMissing } = prepareTranslation(ctx.i18n, {
      i18nKey: keyString,
      params: allParams,
      ns: local.ns,
      locale: local.locale,
      fallback: local.fallback,
      markers: local.markers,
      components: local.components,
    });

    if (isMissing && local.children !== undefined) {
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
