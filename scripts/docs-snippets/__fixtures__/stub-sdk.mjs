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

export interface I18nOptions {
  locale: string;
  fallbackLocale?: string | string[];
  translation?: Record<string, Record<string, unknown>>;
  compiler?: unknown;
}

export interface I18n {
  t(key: AnyKey, params?: Record<string, unknown>): string;
  with<R>(installer: (i18n: this) => R): R;
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

const CORE_PLUGINS = `export declare function plugins(): <T>(i18n: T) => T;\n`;
const CORE_ICU = `export declare function icu(): <T>(i18n: T) => T;\n`;

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
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "stub-sdk-root", private: true, type: "module" }, null, 2),
  );
  return dir;
}
