/**
 * The one emitter of the 0.8 declaration (`comvi.d.ts`, design §3.8 + rev 3 R3-2a): the
 * `Catalogs` interface of `@comvi/core`, one member per namespace, one property per key,
 * whose type is the key's params DIRECTLY (no `{ params }` wrapper, `p-flat-u2i`):
 *
 *   import type { Tag } from '@comvi/react';
 *   declare module '@comvi/react' {
 *     interface Catalogs {
 *       "default": {
 *         "cart.items": { "count": number };
 *         "gender": { "g": "female" | "male" | (string & {}) };
 *         "hello": { "brand"?: string | number; "name": string | number };  // brand ∈ defaultParams
 *         "terms": { "link": Tag };          // a Tag-typed param: the key renders rich parts
 *         "title": never;                    // no params
 *       };
 *     }
 *   }
 *
 * Every source (platform route, local directory, the CLI, the Vite plugin, Next, Nuxt)
 * ends here, so equal schemas give equal bytes. Rules the type gates rely on (R3-19): flat
 * string keys, no template-literal path types, one inline object type per namespace (the
 * key union is `keyof` of it, cached by core's mapped `KeysOf`), params read by indexed
 * access, nothing repeated per locale.
 *
 * No Node built-ins and no runtime imports (only `import type`): `scripts/types-bench`
 * loads this file with Node's own type stripping to generate its probes with the emitter
 * that ships.
 */
// Type-only: erased by Node's type stripping, so this file loads with no other module.
import type { WireParam, WireSchema } from "./wire";

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface EmitCatalogsOptions {
  /**
   * The module the declarations augment: the Comvi package the app declares
   * (`resolveAugmentationTarget`). It must export `Catalogs` and, when a key has a tag,
   * `Tag`. @default '@comvi/core'
   */
  augment?: string;
  /**
   * Param names the app gives a default with `createI18n({ defaultParams })`: optional in
   * every key's params (R3-3).
   */
  defaultParams?: readonly string[];
}

/**
 * Names that are per-call options of `t()` (R3-1, R3-14 H9): `t("k", { ns, locale,
 * markers })` never passes them to the message, so a message param of that name could
 * never receive a value.
 */
export const RESERVED_PARAMS = ["ns", "locale", "markers"] as const;

/** Header line 3; the bytes do not depend on the tool or the source that wrote the file. */
export const HEADER_NOTICE = "DO NOT EDIT — this file is generated from your translation schema";

const MODULE_SPECIFIER = /^[A-Za-z0-9_@#./:~+-]+$/;

/** A schema the declarations cannot express. Every problem is listed, not only the first. */
export class EmitError extends Error {
  /** One line per problem. (A plain field: Node's type stripping loads this file.) */
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Cannot generate Comvi types:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EmitError";
    this.problems = problems;
  }
}

const q = JSON.stringify;

/** The TypeScript type of one param. */
function paramType(p: WireParam): string {
  switch (p.kind) {
    // A plain `{x}` prints String(value) (R3-17): numbers are fine there (COM-168).
    case "string":
      return "string | number";
    case "number":
    case "plural":
    case "selectordinal":
      return "number";
    case "select": {
      const options = (p.options ?? []).map((o) => q(o));
      // No options and no `other` (only a platform schema says so; core refuses such a
      // message): `string` keeps the key callable, and generation warns (selectsWithoutOptions).
      if (!options.length) return "string";
      if (p.other !== false) options.push("(string & {})");
      return options.join(" | ");
    }
    // Messages core refuses (R3-8): typed by what they ask for; generation reports them.
    case "date":
    case "time":
      return "Date | number";
  }
}

/** Every `select` param with neither options nor `other`, as `[namespace, key, param]`. */
export function selectsWithoutOptions(schema: WireSchema): Array<[string, string, string]> {
  const found: Array<[string, string, string]> = [];
  for (const [ns, keys] of Object.entries(schema.namespaces))
    for (const [key, entry] of Object.entries(keys))
      for (const [name, p] of Object.entries(entry.params ?? {}))
        if (p.kind === "select" && !p.options?.length && p.other === false)
          found.push([ns, key, name]);
  return found;
}

/**
 * The declaration file for `schema`. Throws {@link EmitError} for a param named `ns`,
 * `locale` or `markers` and for an `augment` that is not a module specifier.
 */
export function emitCatalogs(schema: WireSchema, options: EmitCatalogsOptions = {}): string {
  const augment = options.augment ?? "@comvi/core";
  const defaults = new Set(options.defaultParams ?? []);
  const problems: string[] = [];
  if (!MODULE_SPECIFIER.test(augment))
    problems.push(
      `\`augment\` must be a module specifier (letters, digits and @ # . / : ~ + - _), received ${q(augment)}`,
    );

  let usesTag = false;
  const body: string[] = [];
  for (const ns of Object.keys(schema.namespaces).sort(byCodeUnit)) {
    const keys = schema.namespaces[ns];
    const names = Object.keys(keys).sort(byCodeUnit);
    if (names.length === 0) {
      body.push(`    ${q(ns)}: {};`);
      continue;
    }
    body.push(`    ${q(ns)}: {`);
    for (const key of names) {
      const entry = keys[key];
      // Tags are params too: core calls the param of the tag's name with the children.
      const members = new Map<string, string>();
      for (const [name, p] of Object.entries(entry.params ?? {})) members.set(name, paramType(p));
      for (const tag of entry.tags ?? []) {
        members.set(tag, "Tag");
        usesTag = true;
      }
      for (const name of members.keys())
        if ((RESERVED_PARAMS as readonly string[]).includes(name))
          problems.push(
            `${q(ns)} ${q(key)}: the message uses {${name}}, but \`${name}\` is a per-call option of t() (ns, locale, markers) and never reaches a message — rename the param`,
          );
      if (members.size === 0) {
        body.push(`      ${q(key)}: never;`);
        continue;
      }
      const props = [...members.keys()]
        .sort(byCodeUnit)
        .map((name) => `${q(name)}${defaults.has(name) ? "?" : ""}: ${members.get(name)}`);
      body.push(`      ${q(key)}: { ${props.join("; ")} };`);
    }
    body.push("    };");
  }
  if (problems.length) throw new EmitError(problems);

  return [
    "/**",
    ` * Comvi translation catalogs, augmenting '${augment}'`,
    ` * ${HEADER_NOTICE}`,
    " */",
    "",
    // The import is load-bearing: without it, an unresolved specifier makes the block
    // below declare a NEW ambient module and every key would type-check against nothing.
    usesTag ? `import type { Tag } from '${augment}';` : `import '${augment}';`,
    "",
    `declare module '${augment}' {`,
    "  interface Catalogs {",
    ...body,
    "  }",
    "}",
    "",
    "export {};",
    "",
  ].join("\n");
}
