/**
 * Which module a generated declaration file augments — read from the app's own
 * `package.json` (the module the app DECLARES). Shared by the 0.7 emitter below and the
 * 0.8 `generate()`/`watch()` (`v2/generate.ts`).
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
