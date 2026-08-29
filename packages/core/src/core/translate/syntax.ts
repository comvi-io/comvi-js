import type { TagInterpolationOptions, TranslationParams } from "../../types";
import type { VirtualNode } from "../../virtualNode";
import { warn } from "../../logger";
import type { ParsedToken, PluralToken, SelectToken } from "./cache";
import type { ArgOpensHashScope } from "./parser";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** How a placeholder renders when its parameter is absent or `undefined`. */
export type MissingParamMode = "literal" | "drop";

/**
 * Message compiler contract (INTERNAL — never exported from the package root).
 *
 * A compiler decides what an ICU-style `{...}` argument compiles to and how
 * the non-trivial argument tokens it produced (plural/select) are processed.
 * The shared pipeline (translate.ts) owns everything else: parsing skeleton,
 * template cache, param interpolation, extension dispatch.
 */
export interface MessageCompiler {
  /**
   * Pre-assigned compiler id (simple = 1, icu = 2). User-injected compilers
   * leave this unset and get a WeakMap-backed auto-incremented id (>= 3).
   * The id is part of every template cache key, so two compilers never share
   * a cached parse of the same template string.
   */
  readonly cid?: number;
  /**
   * Build a token from the content between balanced `{`...`}`.
   * Returning `undefined` makes the whole braced segment flow through as
   * literal text. On ICU argument syntax the shipped simple compiler THROWS
   * in development and returns `undefined` in production, where the host then
   * reports `E_ICU_SYNTAX` for the segment it rendered literally.
   */
  makeArgToken(content: string, hashIsSyntax: boolean, template: string): ParsedToken | undefined;
  /**
   * Whether the `{` at braceIndex opens an argument that rebinds `#` to a
   * count (ICU plural/selectordinal). Unset when the compiler has no such
   * syntax; the parser then never treats `#` as syntax inside braces.
   */
  readonly argOpensHashScope?: ArgOpensHashScope;
  /**
   * Process a plural/select token this compiler produced. Only present when
   * `makeArgToken` can emit such tokens.
   */
  processArgToken?(
    token: PluralToken | SelectToken,
    ctx: TranslateCtx,
    hashIsSyntax: boolean,
  ): string | Array<string | VirtualNode>;
}

/**
 * Per-translate-call context threaded through the pipeline. Created once per
 * top-level translate call; nested dynamic segments reuse it (`template`
 * stays the top-level template for diagnostics).
 */
export interface TranslateCtx {
  /** Top-level template being rendered (diagnostics only). */
  template: string;
  params: TranslationParams;
  locale: string;
  tagInterpolation: TagInterpolationOptions | undefined;
  compiler: MessageCompiler;
  compilerId: number;
  /** Effective (ambient ∪ per-call) extension set for this call. */
  extensions: readonly SyntaxExtension[];
  /** Precomputed bitmask over `extensions[].cacheBit`. */
  extBits: number;
  missingParam: MissingParamMode;
  /** Lazily memoized cardinal plural rules for `locale` (ICU compiler only). */
  pluralRules?: Intl.PluralRules;
}

/**
 * A syntax extension claims characters the core grammar leaves open (today:
 * `<`) at parse time and processes the tokens it produced at render time.
 */
export interface SyntaxExtension {
  /** Stable identifier; registration is idempotent by id. */
  id: string;
  /**
   * Single bit contributed to the template-cache key's extension bitfield.
   * Must be a power of two and unique across concurrently used extensions.
   */
  cacheBit: number;
  /**
   * Consulted when the parser encounters `<` outside quoted text. Return the
   * parsed token and the index after the consumed input, or `undefined` to
   * let the character flow through as literal text.
   */
  parseHook(
    template: string,
    index: number,
    len: number,
    hashIsSyntax: boolean,
    extensions: readonly SyntaxExtension[],
    compiler: MessageCompiler,
  ): { token: ParsedToken; endIndex: number } | undefined;
  /**
   * Process a token this extension produced. Return `undefined` to pass to
   * the next extension.
   */
  processHook(
    token: ParsedToken,
    ctx: TranslateCtx,
    hashIsSyntax: boolean,
  ): string | VirtualNode | Array<string | VirtualNode> | undefined;
}

// ---------------------------------------------------------------------------
// Compiler identity
// ---------------------------------------------------------------------------

const injectedCompilerIds = new WeakMap<MessageCompiler, number>();
let nextCompilerId = 3;

/**
 * Resolve the small-integer identity of a compiler: pre-assigned `cid` for
 * the built-ins, WeakMap-backed auto-increment (starting at 3) for injected
 * compilers.
 */
export function getCompilerId(compiler: MessageCompiler): number {
  if (compiler.cid !== undefined) return compiler.cid;
  let id = injectedCompilerIds.get(compiler);
  if (id === undefined) {
    id = nextCompilerId++;
    injectedCompilerIds.set(compiler, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Ambient extension registry (module-global; string-API channel)
// ---------------------------------------------------------------------------

/** Live registration list (mutated in place). */
const ambient: SyntaxExtension[] = [];
/**
 * Stable snapshot of the ambient set. `effectiveExtensions()` returns this
 * exact array when no per-call extensions are supplied — zero per-call
 * allocation. A NEW array identity is produced on every register/dispose,
 * which is also what invalidates the per-call union cache below.
 */
let ambientSnapshot: readonly SyntaxExtension[] = [];
/** Precomputed bitmask over the ambient set; maintained at registration time. */
let ambientBits = 0;

function rebuildAmbient(): void {
  ambientSnapshot = ambient.slice();
  let bits = 0;
  for (let i = 0; i < ambient.length; i++) bits |= ambient[i].cacheBit;
  ambientBits = bits;
}

/**
 * Register a syntax extension module-globally (ambient channel).
 * Idempotent by `id`. Returns a disposer that removes the registration.
 */
export function registerSyntaxExtension(ext: SyntaxExtension): () => void {
  let present = false;
  for (let i = 0; i < ambient.length; i++) {
    if (ambient[i].id === ext.id) {
      present = true;
    } else if (IS_DEV && ambient[i].cacheBit === ext.cacheBit) {
      warn(
        `[i18n] Syntax extensions "${ambient[i].id}" and "${ext.id}" share cacheBit ${ext.cacheBit}; template cache entries may collide.`,
      );
    }
  }
  if (!present) {
    ambient.push(ext);
    rebuildAmbient();
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (let i = 0; i < ambient.length; i++) {
      if (ambient[i].id === ext.id) {
        ambient.splice(i, 1);
        rebuildAmbient();
        return;
      }
    }
  };
}

/**
 * Remove every ambient registration.
 * @internal Test teardown / SSR multi-tenant escape hatch only.
 */
export function _resetSyntaxExtensions(): void {
  ambient.length = 0;
  rebuildAmbient();
}

/** Current ambient extension set (stable snapshot). */
export function getAmbientExtensions(): readonly SyntaxExtension[] {
  return ambientSnapshot;
}

// ---------------------------------------------------------------------------
// Effective set (ambient ∪ per-call) with O(1) hot path
// ---------------------------------------------------------------------------

interface EffectiveEntry {
  /** Ambient snapshot this union was computed against. */
  snapshot: readonly SyntaxExtension[];
  list: readonly SyntaxExtension[];
  bits: number;
}

/**
 * Union results keyed by the per-call array identity. Wrappers pass a stable
 * options object per component, so this hits after the first call; entries
 * self-invalidate when the ambient snapshot identity changes.
 */
const effectiveCache = new WeakMap<readonly SyntaxExtension[], EffectiveEntry>();

function effectiveEntry(perCall: readonly SyntaxExtension[]): EffectiveEntry {
  let entry = effectiveCache.get(perCall);
  if (entry === undefined || entry.snapshot !== ambientSnapshot) {
    const list = ambientSnapshot.slice();
    let bits = ambientBits;
    for (const ext of perCall) {
      let present = false;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === ext.id) {
          present = true;
          break;
        }
      }
      if (!present) {
        list.push(ext);
        bits |= ext.cacheBit;
      }
    }
    entry = { snapshot: ambientSnapshot, list, bits };
    effectiveCache.set(perCall, entry);
  }
  return entry;
}

/**
 * Effective extension set for a call: ambient ∪ per-call.
 * With no per-call extensions this returns the cached ambient snapshot —
 * zero allocation on the hot path.
 */
export function effectiveExtensions(
  perCall?: readonly SyntaxExtension[],
): readonly SyntaxExtension[] {
  return perCall !== undefined && perCall.length !== 0
    ? effectiveEntry(perCall).list
    : ambientSnapshot;
}

/** Precomputed cache-key bitmask of the effective extension set. */
export function effectiveExtBits(perCall?: readonly SyntaxExtension[]): number {
  return perCall !== undefined && perCall.length !== 0 ? effectiveEntry(perCall).bits : ambientBits;
}

/**
 * Merge a per-call `params.tagInterpolation` over the instance-level option.
 * Per-call fields override; `extensions` are UNIONED (instance first, then
 * per-call) so a per-call extension can never silently disable
 * instance-configured ones. Duplicate ids are tolerated: cache bits OR
 * idempotently and hook dispatch stops at the first claim.
 *
 * Identity-friendly: when one side is absent the other object is returned
 * as-is, so a module-constant per-call options object (the
 * `prepareTranslation` path) keeps a stable `extensions` identity and hits
 * the effective-set WeakMap cache.
 */
export function mergeTagInterpolation(
  base: TagInterpolationOptions | undefined,
  perCall: TagInterpolationOptions | undefined,
): TagInterpolationOptions | undefined {
  if (perCall === undefined) return base;
  if (base === undefined) return perCall;
  const merged: TagInterpolationOptions = { ...base, ...perCall };
  const baseExts = base.extensions;
  if (baseExts && perCall.extensions) {
    merged.extensions = baseExts.concat(perCall.extensions);
  }
  return merged;
}
