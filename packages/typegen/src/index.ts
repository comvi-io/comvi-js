/**
 * The declaration emitter behind `@comvi/cli` and `@comvi/vite-plugin`.
 *
 * Both tools used to carry their own copy of this code, kept in step by a
 * repo-level parity test. A user who generates types with the CLI in CI and
 * with the Vite plugin in dev has to get the same declarations, so the copies
 * were merged into this package instead: the format lives in one place and
 * cannot drift.
 *
 * Zero dependencies, and the emitter itself uses no Node built-ins — the caller
 * owns reading the schema and writing the file. `resolveAugmentationTarget` is
 * the exception: which module a generated file augments is read from the app's
 * own `package.json`, and both callers are Node tools.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The modules a generated file can augment, in the order one is chosen.
 *
 * `t()`'s key type reads `TranslationKeys` as `@comvi/core` declares it, and a
 * `declare module '@comvi/<binding>'` block merges into that same interface —
 * each binding re-exports it, and `tests/types-keys-via-binding` in every
 * binding package is the executable proof, one program per binding.
 *
 * So the file augments the module the APP DECLARES, which is the one specifier
 * the app is guaranteed to resolve: the documented install is a single package,
 * and core arrives as its transitive dependency, which a strict pnpm layout or
 * Yarn PnP will not let the app name. Core comes first because an app that
 * declares it means it.
 */
export const AUGMENTABLE_MODULES = [
  "@comvi/core",
  "@comvi/react",
  "@comvi/next",
  "@comvi/vue",
  "@comvi/nuxt",
  "@comvi/svelte",
  "@comvi/solid",
] as const;

/** The module a generated file augments when the caller names none. */
const DEFAULT_AUGMENTED_MODULE = AUGMENTABLE_MODULES[0];

/** The parts of an app's `package.json` that decide the target. */
export interface AppManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * The module an app with this manifest should have its types augment, or
 * `undefined` when it declares none of them.
 *
 * DECLARED, not installed: the answer is a property of the app's own manifest,
 * so it is the same on every machine and under every package manager. That is
 * what lets `--check` regenerate the same file the write path produced, and it
 * is why nothing here touches `node_modules` — a physical lookup made Yarn PnP
 * (no `node_modules` at all) impossible to generate for.
 *
 * `dependencies` and `devDependencies` of THIS manifest, and nothing else. A
 * workspace root that declares the package for its apps does not count, and
 * neither does `peerDependencies`: a peer is what a consumer must supply, not
 * what this package resolves. The honest peer case — a component library that
 * localizes its own components — declares the binding as a peer AND as a
 * devDependency, and the devDependency is what is read. An app that relied on
 * a hoisted copy instead is refused, with the error saying so.
 *
 * Own keys only: an inherited `dependencies` entry is not a declaration.
 */
export function chooseAugmentationTarget(manifest: AppManifest): string | undefined {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);

  return AUGMENTABLE_MODULES.find((module) => declared.has(module));
}

/**
 * The characters a module specifier `augment` may use: package names (scoped
 * or not), subpaths, `#` imports, `~/` aliases and relative paths. The value
 * is interpolated between single quotes in the header comment, the side-effect
 * import and the `declare module` line, so anything that could end the string
 * or the comment (a quote, backslash, `*`, whitespace or a line terminator) is
 * refused rather than escaped: escaping would change the bytes every existing
 * file was generated with, and `--check` compares them literally.
 */
const MODULE_SPECIFIER = /^[A-Za-z0-9_@#./:~+-]+$/;

/** Whether `value` is safe to emit as the augmented module's specifier. */
export function isModuleSpecifier(value: string): boolean {
  return MODULE_SPECIFIER.test(value);
}

function assertModuleSpecifier(value: string): void {
  if (!isModuleSpecifier(value)) {
    throw new Error(
      `\`augment\` must be a module specifier (letters, digits and @ # . / : ~ + - _), ` +
        `received ${JSON.stringify(value)}`,
    );
  }
}

/**
 * The module the app at `appRoot` has its generated types augment.
 *
 * `override` is the app's explicit choice (`augment` in the CLI config or the
 * Vite plugin options) and wins over the manifest — a private wrapper package
 * that re-exports a binding is a legitimate target this rule cannot guess.
 *
 * @throws when the app declares no Comvi module and names none
 */
export function resolveAugmentationTarget(appRoot: string, override?: string): string {
  if (override !== undefined) {
    if (override.trim() === "") {
      throw new Error(
        "`augment` is empty. Name the module the generated types should augment, " +
          "or remove the option to use the one this app declares.",
      );
    }
    const target = override.trim();
    assertModuleSpecifier(target);
    return target;
  }

  const manifestPath = join(appRoot, "package.json");
  let manifest: AppManifest | undefined;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AppManifest;
  } catch {
    manifest = undefined;
  }

  const target = manifest === undefined ? undefined : chooseAugmentationTarget(manifest);
  if (target !== undefined) return target;

  throw new Error(
    `Generated types have to augment a Comvi module, and ${manifestPath} declares none.\n` +
      `Add the package this app imports \`t()\` from to its dependencies — one of ` +
      `${AUGMENTABLE_MODULES.slice(1).join(", ")} — or \`${DEFAULT_AUGMENTED_MODULE}\` itself. ` +
      `Declaring it in a workspace root or under peerDependencies is not enough: this app's ` +
      `own package.json must list it, or set \`augment\` — which is also how a private wrapper ` +
      `package that re-exports one of them is named.`,
  );
}

/** `number` is the type carried by plural counts. */
export interface SchemaParam {
  name: string;
  type: "string" | "number";
}

export interface KeySchema {
  params: SchemaParam[];
}

/** Keys are in `"namespace:key"` format, e.g. `"common:greeting"`. */
export interface ProjectSchema {
  keys: Record<string, KeySchema>;
}

export interface EmitOptions {
  /** Make params required (true) or optional (false). @default true */
  strictParams?: boolean;
  /** Default namespace — keys from this ns drop their prefix. @default 'default' */
  defaultNs?: string;
  /**
   * The module the declarations augment — `resolveAugmentationTarget`'s answer
   * for the app being generated for. @default '@comvi/core'
   */
  augment?: string;
}

/**
 * Header line 3 of every generated file, and deliberately NOT a caller option.
 *
 * `@comvi/cli` and `@comvi/vite-plugin` each used to stamp its own name here.
 * Byte-identical output is the contract between them — `TypeGenerator.check`
 * compares the file on disk against freshly emitted output literally — so the
 * two wordings made a Vite-written file look stale to a CLI check in CI, drift
 * that regenerating could never clear. One line that names no tool cannot
 * drift, and there is no option left to reintroduce the difference.
 *
 * The line carries no timestamp either: a regenerated file that is otherwise
 * unchanged must be byte-identical, or every run dirties the working tree.
 */
const HEADER_NOTICE = "DO NOT EDIT — this file is generated from your translation schema";

/**
 * Header comment lines a regeneration is allowed to have changed, matched once
 * the comment indent is trimmed.
 *
 * `* Generated at:` is the timestamp line `@comvi/cli` 0.4 wrote under its own
 * header. `* DO NOT EDIT` is header line 3 in every wording that has shipped:
 * 0.4's "generated by @comvi/cli", early 0.5's "regenerated by
 * @comvi/vite-plugin", and today's tool-neutral line. Dropping it from both
 * sides is what keeps a file written by either tool, at either version, from
 * being reported stale on upgrade.
 *
 * Anchored to the start of the trimmed line rather than searched: a translation
 * key may contain either text, and a key's declaration line starts with its
 * own quote, never with `*`. Matching anywhere on the line would erase a real
 * key from both sides of the comparison and hide drift in it forever.
 */
const DROPPED_HEADER_PREFIXES = ["* Generated at:", "* DO NOT EDIT"];

export function emitDeclarations(schema: ProjectSchema, options: EmitOptions = {}): string {
  const {
    strictParams = true,
    defaultNs = "default",
    augment = DEFAULT_AUGMENTED_MODULE,
  } = options;
  const defaultPrefix = `${defaultNs}:`;
  assertModuleSpecifier(augment);

  const lines: string[] = [
    "/**",
    // The target is named here because it is a property of the project, not of
    // the format: change which Comvi package the app depends on and this file
    // has to be regenerated. `--check` compares this line, so it says so.
    ` * Auto-generated translation keys, augmenting '${augment}'`,
    ` * ${HEADER_NOTICE}`,
    " */",
    "",
    // The side-effect import is load-bearing, not decoration: without it the
    // `declare module` block below declares a NEW ambient module when the
    // specifier does not resolve, instead of merging into the interface, and
    // every unknown key then type-checks with no error anywhere.
    "// Import to ensure module is resolved before augmentation",
    `import '${augment}';`,
    "",
    `declare module '${augment}' {`,
    "  interface TranslationKeys {",
  ];

  // Code-unit order, which is what `Object.keys().sort()` gives. `localeCompare`
  // used to order this list, and disagreed with the other copy of the emitter on
  // any pair that differs in case.
  const paramsByKey = new Map<string, SchemaParam[]>();
  for (const [fullKey, keySchema] of Object.entries(schema.keys)) {
    const displayKey = fullKey.startsWith(defaultPrefix)
      ? fullKey.slice(defaultPrefix.length)
      : fullKey;

    // Two schema keys can map to one emitted key once the default prefix is
    // gone. Silently keeping the last one drops a key from the declarations and
    // the user finds out at the call site.
    if (paramsByKey.has(displayKey)) {
      throw new Error(
        `Translation key collision after stripping default namespace '${defaultNs}': '${fullKey}' maps to '${displayKey}'`,
      );
    }

    paramsByKey.set(displayKey, keySchema.params);
  }

  for (const key of [...paramsByKey.keys()].sort()) {
    lines.push(formatKeyType(key, paramsByKey.get(key)!, "    ", strictParams));
  }

  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("export {};");
  lines.push("");

  return lines.join("\n");
}

/**
 * Key lines already in a generated file on disk, counted for the CI report.
 * Both quote styles count: this emitter writes JSON-quoted keys, and a file left
 * by an older generator is single-quoted.
 */
export function countKeyLines(content: string): number {
  return content.match(/^\s+(?:'[^']*'|"(?:[^"\\]|\\.)*"):.*$/gm)?.length ?? 0;
}

/**
 * Drops what a regeneration is allowed to have changed, so `--check` compares
 * only the declarations. WHOLE header lines go, not just their tails: leaving
 * an emptied line behind would report every existing repo as stale on upgrade.
 */
export function normalizeGenerated(content: string): string {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !DROPPED_HEADER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    })
    .join("\n")
    .trim();
}

function formatKeyType(
  key: string,
  params: SchemaParam[],
  indent: string,
  strictParams: boolean,
): string {
  // Property names go through JSON.stringify: a key or param name is free text
  // from the project, and an apostrophe in it used to close the quote and emit
  // a file TypeScript could not parse.
  if (params.length === 0) {
    return `${indent}${JSON.stringify(key)}: never;`;
  }

  const paramTypes = params.map((p) => {
    assertSupportedParamType(key, p);
    const optional = strictParams ? "" : "?";
    return `${JSON.stringify(p.name)}${optional}: ${p.type}`;
  });

  return `${indent}${JSON.stringify(key)}: { ${paramTypes.join("; ")} };`;
}

/**
 * A param type outside the schema contract would be pasted verbatim into the
 * declarations. Refuse it instead of emitting a file the user has to debug.
 */
function assertSupportedParamType(key: string, param: SchemaParam): void {
  if (param.type === "string" || param.type === "number") {
    return;
  }

  throw new Error(
    `Unsupported param type for translation key '${key}': param '${param.name}' has type '${param.type}'. Only 'string' and 'number' are supported.`,
  );
}
