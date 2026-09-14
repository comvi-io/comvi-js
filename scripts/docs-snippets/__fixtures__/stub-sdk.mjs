/**
 * A miniature `@comvi/core` on disk, for the type-check driver's tests.
 *
 * The tests could point `--sdk-root` at the repo, but `test:release-tools` runs
 * BEFORE `pnpm build` in `test:release`, so the packages' `dist` may not exist yet
 * — and a test that skips itself when the dist is missing is a test nobody ever
 * sees fail. So the tests build their own SDK: small, present always, and
 * precise about the one type relationship the isolation test turns on.
 *
 * `PermissiveKey` is copied from core's real shape, because it is the whole
 * reason a page is the unit of compilation: `keyof TranslationKeys extends never
 * ? string : never` means an EMPTY `TranslationKeys` accepts any string, and one
 * augmentation anywhere in the program makes `t(someString)` an error
 * everywhere. If this stub got that backwards, the isolation test would pass
 * against a program where isolation did not matter.
 */

import fs from "node:fs";
import path from "node:path";

const CORE_INDEX = `
export interface TranslationKeys {}
type PermissiveKey = keyof TranslationKeys extends never ? string : never;
export type AnyKey = keyof TranslationKeys | PermissiveKey;

export interface MessageCompiler {
  (message: string): (params?: Record<string, unknown>) => string;
}

export interface I18nOptions {
  locale: string;
  fallbackLocale?: string | string[];
  translation?: Record<string, Record<string, unknown>>;
  compiler?: MessageCompiler;
}

export interface I18n {
  t(key: AnyKey, params?: Record<string, unknown>): string;
  use<R>(installer: (i18n: this) => R): R;
  registerPlugin(plugin: (i18n: I18n) => unknown, options?: Record<string, unknown>): I18n;
  reloadTranslations(locale?: string, namespace?: string): Promise<void>;
  locale: string;
}

export declare function createI18n(options: I18nOptions): I18n;
`;

const CORE_LOADER = `
export declare function loader(
  map?: Record<string, () => Promise<unknown>>,
): <T>(i18n: T) => T;
`;

/**
 * `@comvi/core/plugins` publishes the capability installer AND the helper an app
 * wraps its own inline plugin in (brief E §3). `definePlugin(fn)` is what makes
 * `.use(` the one verb work for a raw function: `.use(fn)` throws
 * `E_USE_NOT_INSTALLER` at runtime, and the fences the gate checks must be able
 * to show the form that does not. The name is deliberately not `plugin`: one
 * character from `plugins()`, with the opposite job, in the same chain.
 *
 * `use` is declared on the host in the index, so the stub does not model the
 * widening: both installers return the host they were given, which is enough
 * for a fence to compile and is the one relationship the driver's tests turn on.
 * The callback is typed with the host, not `unknown`, so a fence that writes
 * `definePlugin((i18n) => i18n.t("k"))` gets the parameter inferred the way a
 * reader's project infers it.
 */
const CORE_PLUGINS = `
import type { I18n } from "@comvi/core";
export declare function plugins(): <T>(i18n: T) => T;
export declare function definePlugin(
  fn: (i18n: I18n) => unknown,
  options?: Record<string, unknown>,
): <T>(i18n: T) => T;
`;

/**
 * `@comvi/core/icu` publishes a COMPILER, not an installer. There is no `icu()`
 * and no `CompilerLockedError`: ICU is enabled by `compiler: icuCompiler` in the
 * constructor options, so a snippet that reaches for the installer must fail to
 * resolve here exactly as it would in a reader's project.
 *
 * `MessageCompiler` is DECLARED in the index and re-exported here, one type for
 * both entries. The option is typed with it rather than `unknown`, so
 * `compiler: "icu"` — the shape a reader lands on after reading a page that
 * still talks about an installer — is a type error the gate reports instead of a
 * string the compiler happily accepts.
 *
 * The specifier is bare, not relative: the stub package is `"type": "module"`,
 * and the node16 pass rejects an extensionless relative import in one (TS2834).
 * `@comvi/core` resolves through the exports map under both passes.
 */
const CORE_ICU = `
export type { MessageCompiler } from "@comvi/core";
import type { MessageCompiler } from "@comvi/core";
export declare const icuCompiler: MessageCompiler;
`;

/**
 * A miniature `@comvi/nuxt`, for the one relationship the registry emulation
 * turns on.
 *
 * `ComviNuxtHostRegistry` is EMPTY here, exactly as it is in the real package:
 * this package compiles without any app, and `ResolvedNuxtHost` therefore falls
 * back to core's base `I18n` — which has no `registerLoader`. The module's
 * codegen is what fills the slot, by reading the host type off the app's
 * `comvi.host` factory, and `typecheck.mjs` emits the same declaration for a
 * fence group holding that file. So a group WITH the host fence must compile
 * `core.registerLoader(...)` and the same group WITHOUT it must report TS2339 —
 * a stub that gave the base host a `registerLoader` could not tell the two
 * apart, and the test would pass against tooling that does nothing.
 *
 * `loader()` widens, and `createI18n` does not: that is how the factory's return
 * type comes to differ from the fallback in the first place.
 */
const NUXT_INDEX = `
import type { I18n } from "@comvi/core";
export type { I18n };

export type LoaderFn = (locale: string, namespace: string) => Promise<unknown>;

export interface I18nLoaderApi {
  registerLoader(load: LoaderFn): void;
}

export interface ComviNuxtHostRegistry {}

export type RegisteredNuxtHost<Fallback extends I18n> = ComviNuxtHostRegistry extends {
  host: infer H;
}
  ? H extends I18n
    ? H
    : Fallback
  : Fallback;

export type ResolvedNuxtHost = RegisteredNuxtHost<I18n>;

export interface NuxtI18nSetupContext<C extends I18n = ResolvedNuxtHost> {
  core: C;
}

export type NuxtI18nSetup<C extends I18n = ResolvedNuxtHost> = (
  context: NuxtI18nSetupContext<C>,
) => void | Promise<void>;

export type NuxtHostFactory = (options: { locale: string }) => I18n;
`;

const NUXT_HOST = `
import type { I18n } from "@comvi/core";
import type { I18nLoaderApi } from "@comvi/nuxt";
export type { NuxtHostFactory, LoaderFn } from "@comvi/nuxt";
export declare function createI18n(options: { locale: string }): I18n;
export declare function loader(
  map: Record<string, () => Promise<unknown>>,
): <T>(i18n: T) => T & I18nLoaderApi;
`;

/**
 * Write the stub under `dir` and return `dir`, ready to be an `--sdk-root`.
 *
 * The `exports` map is real, not a `types` shortcut, because the driver resolves
 * subpaths the way a reader's bundler does — through `exports` — and a stub that
 * cheated there would let a broken subpath pass in the tests and fail in the run.
 */
export function writeStubSdk(dir) {
  const core = path.join(dir, "node_modules", "@comvi", "core");
  fs.mkdirSync(core, { recursive: true });
  fs.writeFileSync(
    path.join(core, "package.json"),
    JSON.stringify(
      {
        name: "@comvi/core",
        version: "0.5.0",
        type: "module",
        exports: {
          ".": { types: "./index.d.ts", default: "./index.js" },
          "./loader": { types: "./loader.d.ts", default: "./loader.js" },
          "./plugins": { types: "./plugins.d.ts", default: "./plugins.js" },
          "./icu": { types: "./icu.d.ts", default: "./icu.js" },
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(core, "index.d.ts"), CORE_INDEX);
  fs.writeFileSync(path.join(core, "loader.d.ts"), CORE_LOADER);
  fs.writeFileSync(path.join(core, "plugins.d.ts"), CORE_PLUGINS);
  fs.writeFileSync(path.join(core, "icu.d.ts"), CORE_ICU);
  for (const name of ["index", "loader", "plugins", "icu"]) {
    fs.writeFileSync(path.join(core, `${name}.js`), "export {};\n");
  }

  const nuxt = path.join(dir, "node_modules", "@comvi", "nuxt");
  fs.mkdirSync(nuxt, { recursive: true });
  fs.writeFileSync(
    path.join(nuxt, "package.json"),
    JSON.stringify(
      {
        name: "@comvi/nuxt",
        version: "0.5.0",
        type: "module",
        exports: {
          ".": { types: "./index.d.ts", default: "./index.js" },
          "./host": { types: "./host.d.ts", default: "./host.js" },
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(nuxt, "index.d.ts"), NUXT_INDEX);
  fs.writeFileSync(path.join(nuxt, "host.d.ts"), NUXT_HOST);
  for (const name of ["index", "host"]) {
    fs.writeFileSync(path.join(nuxt, `${name}.js`), "export {};\n");
  }

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "stub-sdk-root", private: true, type: "module" }, null, 2),
  );
  return dir;
}

/**
 * A root the SFC checkers can actually run against.
 *
 * vue-tsc and svelte-check need the real `vue` / `svelte` compilers, which no
 * stub can fake, so this borrows them from the repo by symlink and adds ONE
 * package of its own: `@docs-probe/api`, whose `Registry` interface has the
 * same `keyof … extends never` shape core's `TranslationKeys` does.
 *
 * A bare specifier is the point. Two projects on a page resolve
 * `@docs-probe/api` to the SAME file, which is why a `declare module` in one
 * tab reaches the other when they share a program — and why a relative module
 * would not reproduce the bug at all. Nothing here depends on `packages/*`
 * having been built, so it works in `test:release-tools`, which runs before the
 * build.
 */
export function writeSfcProbeSdk(dir, repoRoot) {
  const modules = path.join(dir, "node_modules");
  fs.mkdirSync(modules, { recursive: true });
  for (const name of ["vue", "@vue", "svelte", "typescript", "@types"]) {
    const from = path.join(repoRoot, "node_modules", name);
    if (!fs.existsSync(from)) continue;
    fs.symlinkSync(fs.realpathSync(from), path.join(modules, name), "junction");
  }

  const api = path.join(modules, "@docs-probe", "api");
  fs.mkdirSync(api, { recursive: true });
  fs.writeFileSync(
    path.join(api, "package.json"),
    JSON.stringify({
      name: "@docs-probe/api",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    }),
  );
  fs.writeFileSync(
    path.join(api, "index.d.ts"),
    [
      "export interface Registry {}",
      "type Permissive = keyof Registry extends never ? string : never;",
      "export declare function t(key: keyof Registry | Permissive): string;",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(api, "index.js"), "export {};\n");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "sfc-probe-root", private: true, type: "module" }, null, 2),
  );
  return dir;
}
