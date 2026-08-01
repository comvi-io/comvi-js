/**
 * T-core: the framework-neutral `<T>` pipeline shared by every wrapper.
 *
 * Absorbs the previously 4×-duplicated component plumbing (vue/react/solid/
 * svelte): the marker-based handler transport, `childrenToArray`, the
 * reserved-prop transport if-chains, and the missing-translation check.
 * Wrappers keep only a small VirtualNode → native-node converter.
 *
 * Tag syntax is activated PER CALL through `params.tagInterpolation`
 * (§1.1 dual-channel): rendering never depends on ambient registration,
 * `sideEffects` arrays, or import order.
 *
 * Exported from `@comvi/core/tags` ONLY — it is meaningless without tag
 * machinery and must never enter slim consumers' graphs via the root entry.
 */
import type {
  TagCallbackParams,
  TagInterpolationOptions,
  TranslationParams,
} from "../types";
import type { TranslationResult, VirtualNode } from "../virtualNode";
import { createElement } from "../virtualNode";
import { tagSyntaxExtension } from "./translate/tags";

/**
 * Marker tag transport: opaque framework handlers (components, elements,
 * render functions) cannot run inside the core pipeline, so their tags are
 * emitted as `__comvi_handler_<name>__` element nodes and resolved by the
 * wrapper's converter via `pendingHandlers`.
 */
const MARKER_PREFIX = "__comvi_handler_";
const MARKER_SUFFIX = "__";
const MARKER_MIN_LENGTH = MARKER_PREFIX.length + MARKER_SUFFIX.length;

/** Per-call tag activation; module constant so the effective-set cache hits. */
const TAG_OPTIONS: TagInterpolationOptions = { extensions: [tagSyntaxExtension] };

/**
 * The `{ tag | component, props }` config form of a components-map entry.
 * `tag` (solid/svelte convention) and `component` (vue convention) are
 * aliases; a string value renders directly as that element, anything else is
 * transported as an opaque framework handler together with `props`.
 */
export interface TagComponentConfig {
  tag?: unknown;
  component?: unknown;
  props?: Record<string, unknown>;
}

/**
 * A wrapper `components` prop: tag name → handler. Values the core
 * understands (strings, string-target configs) render directly; everything
 * else (framework components, elements, render functions, slot functions) is
 * opaque and comes back through `pendingHandlers`.
 */
export type TagComponentsMap = Record<string, unknown>;

/** An opaque framework handler awaiting resolution by the wrapper converter. */
export interface PendingHandler {
  /** Tag name as written in the template (`<name>…</name>`). */
  name: string;
  /** The marker tag carried by element nodes in `content` for this handler. */
  marker: string;
  /** The framework-specific handler exactly as supplied in `components`. */
  handler: unknown;
  /** Props from a `{ tag | component, props }` config form, when present. */
  props?: Record<string, unknown>;
}

/** Framework-neutral `<T>` props (wrappers add children/framework extras). */
export interface PrepareTranslationProps {
  /** Translation key to look up. */
  i18nKey: string;
  /** Interpolation parameters (merged under handlers and reserved props). */
  params?: TranslationParams;
  /** Override namespace for this translation. */
  ns?: string;
  /** Override locale for this translation. */
  locale?: string;
  /** Fallback text when the key is missing. */
  fallback?: string;
  /** Skip post-processing for this call. */
  raw?: boolean;
  /** Tag-interpolation handlers (see {@link TagComponentsMap}). */
  components?: TagComponentsMap;
}

export interface PreparedTranslation {
  /** Translation result; marker element nodes stand in for opaque handlers. */
  content: TranslationResult;
  /** Opaque handlers to resolve while converting `content` (empty when none). */
  pendingHandlers: PendingHandler[];
  /**
   * True when the key resolved to nothing (no translation in the locale
   * chain, no fallback requested) — the wrapper should render its
   * children-fallback, if any, instead of `content`.
   */
  isMissing: boolean;
}

/** The slice of an i18n instance `prepareTranslation` consumes. */
export interface PrepareTranslationSource {
  tRaw(key: string, params?: TranslationParams): TranslationResult;
  hasTranslation(
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ): boolean;
}

/**
 * Convert a TranslationResult to the child-array format `createElement`
 * consumes (empty string → no children).
 */
export function childrenToArray(children: TranslationResult): (string | VirtualNode)[] {
  if (typeof children === "string") {
    return children ? [children] : [];
  }
  return Array.isArray(children) ? children : [];
}

/**
 * When `tag` is a handler-transport marker, return the handler name it
 * carries; otherwise `undefined`. Wrapper converters use this to route
 * element nodes to `pendingHandlers`.
 */
export function getPendingHandlerName(tag: string): string | undefined {
  return tag.length > MARKER_MIN_LENGTH &&
    tag.startsWith(MARKER_PREFIX) &&
    tag.endsWith(MARKER_SUFFIX)
    ? tag.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length)
    : undefined;
}

function isTagComponentConfig(value: object): value is TagComponentConfig {
  return "tag" in value || "component" in value;
}

/**
 * Core-format tag handler rendering `tag` (an element name or a transport
 * marker) around the tag's processed children. Single factory for every
 * components-map entry shape.
 */
function elementHandler(
  tag: string,
  props?: Record<string, unknown>,
): (p: TagCallbackParams) => VirtualNode {
  return ({ children }: TagCallbackParams) =>
    createElement(tag, props, childrenToArray(children));
}

/**
 * Run the shared `<T>` pipeline against an i18n instance.
 *
 * - `components` entries with string targets render directly as elements;
 *   opaque framework handlers are transported via marker nodes and returned
 *   in `pendingHandlers` for the wrapper's converter.
 * - Reserved props (`ns`/`locale`/`fallback`/`raw`) override same-named
 *   `params` keys only when the prop is not `undefined`.
 * - The tag syntax extension is passed per call — no ambient registration
 *   required.
 */
export function prepareTranslation(
  i18n: PrepareTranslationSource,
  props: PrepareTranslationProps,
): PreparedTranslation {
  const { params, components } = props;
  const key = String(props.i18nKey);
  const pendingHandlers: PendingHandler[] = [];

  const transport: TranslationParams = params ? { ...params } : {};

  if (components !== undefined) {
    for (const name of Object.keys(components)) {
      const handler = components[name];
      if (handler == null) continue;

      if (typeof handler === "string") {
        transport[name] = elementHandler(handler);
        continue;
      }

      if (typeof handler === "object" && isTagComponentConfig(handler)) {
        const target = handler.tag ?? handler.component;
        if (typeof target === "string") {
          transport[name] = elementHandler(target, handler.props);
          continue;
        }
        const marker = MARKER_PREFIX + name + MARKER_SUFFIX;
        pendingHandlers.push({ name, marker, handler: target, props: handler.props });
        transport[name] = elementHandler(marker);
        continue;
      }

      // Opaque framework handler (component, element, render/slot function)
      const marker = MARKER_PREFIX + name + MARKER_SUFFIX;
      pendingHandlers.push({ name, marker, handler });
      transport[name] = elementHandler(marker);
    }
  }

  if (props.ns !== undefined) transport.ns = props.ns;
  if (props.locale !== undefined) transport.locale = props.locale;
  if (props.fallback !== undefined) transport.fallback = props.fallback;
  if (props.raw !== undefined) transport.raw = props.raw;

  // Per-call tag activation (§1.1 dual-channel). A caller-supplied per-call
  // option keeps its fields; the tag extension is guaranteed present either way.
  const callerTagOptions = transport.tagInterpolation;
  transport.tagInterpolation =
    callerTagOptions === undefined ? TAG_OPTIONS : withTagExtension(callerTagOptions);

  const translationExists = i18n.hasTranslation(key, transport.locale, transport.ns, true);
  const content = i18n.tRaw(key, transport);

  const isMissing =
    !translationExists &&
    transport.fallback === undefined &&
    typeof content === "string" &&
    content === key;

  return { content, pendingHandlers, isMissing };
}

function withTagExtension(options: TagInterpolationOptions): TagInterpolationOptions {
  const extensions = options.extensions;
  if (extensions === undefined || extensions.length === 0) {
    return { ...options, extensions: TAG_OPTIONS.extensions };
  }
  for (const ext of extensions) {
    if (ext.id === tagSyntaxExtension.id) return options;
  }
  return { ...options, extensions: [...extensions, tagSyntaxExtension] };
}
