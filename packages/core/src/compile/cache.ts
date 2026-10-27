/**
 * Compilation and the process-level compile cache (design §2.2, R4-1/R4-2).
 *
 * `compile(template)` turns a catalog string into either
 * - the string itself, when it holds no syntax — a static entry costs nothing more
 *   than the catalog's own string (R4-1c; `typeof === "string"` on the hot path), or
 * - a render function `(params, locale, env) => string | unknown[]`.
 *
 * The cache is `WeakMap<Catalog, Map<SyntaxId, Record<key, Compiled>>>`: keyed by
 * the IDENTITY of an immutable catalog object, so every instance (and every SSR
 * request) that holds a reference to the same catalog shares one compiled record,
 * and a catalog that is dropped takes its record with it. `SyntaxId` comes from
 * syntax flags only — never from per-instance data such as tag renderers, which are
 * read from the parameters at render time (R4-2). Today the grammar has one
 * configuration, so the id is always `0`.
 *
 * Callers resolve the record ONCE when they attach a catalog (`recordFor`) and then
 * read `lookup(record, catalog, key)`; the hot path never touches the WeakMap.
 */
import { devWarn } from "../errors";
import { message, report, run, SYNTAX, type Env, type Params, type Scan } from "./scanner";

declare const __DEV__: boolean;

/** A flat catalog: keys to ICU message strings. Treated as immutable once attached. */
export type Catalog = Readonly<Record<string, string>>;

/** What a compiled message renders: a string, or rich parts when a value is not a string. */
export type Rendered = string | unknown[];
export type Render = (params: Params | undefined, locale: string, env?: Env) => Rendered;
export type Compiled = string | Render;
export type CompiledRecord = Record<string, Compiled>;

/** Bit set of syntax extensions a record was compiled with. One configuration today. */
export type SyntaxId = number;

const EMPTY: Params = Object.freeze(Object.create(null));
/** Characters that can start syntax at the top level; a template without them is static. */
const SYNTAX_START = /[{'<]/;

/**
 * Compiles one template. `key` names the message in reports; a template that fails
 * to compile renders `key` (or the template itself without one) and reports `syntax`
 * on every render, through whichever instance renders it.
 */
export const compile = (template: string, key?: string): Compiled => {
  if (!SYNTAX_START.test(template)) return template;
  const P: Scan = { s: template, i: 0, k: key };
  let parts;
  try {
    parts = message(P, false, false, false);
  } catch (e) {
    if (e !== SYNTAX) throw e;
    const text = __DEV__ ? SYNTAX.m : undefined;
    const fallback = key === undefined ? template : key;
    return (_p, l, x) => {
      report(x, { code: "syntax", key, locale: l, message: text });
      return fallback;
    };
  }
  // Quoting was the only syntax: the unquoted text is static.
  if (parts.length < 2 && typeof parts[0] !== "function") return parts[0] || "";
  const render: Render = (p, l, x) => run(parts, p || EMPTY, l, x, NaN);
  if (__DEV__ && P.w) {
    return (p, l, x) => {
      devWarn(
        "#\0" + key + "\0" + l,
        `\`#\` inside a \`select\` nested in a \`plural\` is a literal \`#\` in ICU ("${key ?? template}"); ` +
          "move the select outside: {g, select, female {{n, plural, …}} …}",
      );
      return render(p, l, x);
    };
  }
  return render;
};

/** Renders a compiled message. */
export const render = (
  compiled: Compiled,
  params: Params | undefined,
  locale: string,
  env?: Env,
): Rendered => (typeof compiled === "string" ? compiled : compiled(params, locale, env));

const records = new WeakMap<Catalog, Map<SyntaxId, CompiledRecord>>();

/** The compiled record of `catalog` for `syntax`, created empty on first use. */
export const recordFor = (catalog: Catalog, syntax: SyntaxId = 0): CompiledRecord => {
  let bySyntax = records.get(catalog);
  if (!bySyntax) records.set(catalog, (bySyntax = new Map()));
  let record = bySyntax.get(syntax);
  if (!record) bySyntax.set(syntax, (record = Object.create(null) as CompiledRecord));
  return record;
};

const own = Object.prototype.hasOwnProperty;

/**
 * The compiled message for `key`, compiling it into `record` on first use. `undefined`
 * when the catalog has no own string under `key` (inherited properties and non-string
 * values are not messages).
 */
export const lookup = (
  record: CompiledRecord,
  catalog: Catalog,
  key: string,
): Compiled | undefined => {
  const hit = record[key];
  if (hit !== undefined) return hit;
  const template = own.call(catalog, key) ? catalog[key] : undefined;
  return typeof template === "string" ? (record[key] = compile(template, key)) : undefined;
};

/**
 * The record for `next`, a catalog derived from `prev` (copy-on-write `add()`), that
 * reuses every compiled entry of `prev` whose template string is unchanged: adding one
 * key to a fully compiled 10K catalog compiles one message, not 10K (R4-1b).
 */
export const inherit = (
  prev: Catalog,
  prevRecord: CompiledRecord,
  next: Catalog,
  syntax: SyntaxId = 0,
): CompiledRecord => {
  const record = recordFor(next, syntax);
  for (const key in prevRecord) {
    if (record[key] === undefined && own.call(next, key) && next[key] === prev[key]) {
      record[key] = prevRecord[key];
    }
  }
  return record;
};
