import { resolve } from "path";
import type { UserConfig, BuildOptions } from "vite";

// In watch mode we keep dist files between rebuilds to avoid transient
// module resolution failures in consuming apps.
const isWatchMode = process.argv.includes("--watch");

/** Workspace packages resolved to source for instant HMR in development. */
const sourcePackages: Record<string, string> = {
  "@comvi/core": "packages/core/src/index.ts",
  "@comvi/vue": "packages/vue/src/index.ts",
  "@comvi/react": "packages/react/src/index.ts",
  "@comvi/svelte": "packages/svelte/src/index.ts",
  "@comvi/next": "packages/next/src/index.ts",
  "@comvi/plugin-fetch-loader": "packages/plugin-fetch-loader/src/index.ts",
  "@comvi/plugin-locale-detector": "packages/plugin-locale-detector/src/index.ts",
  "@comvi/plugin-in-context-editor": "packages/plugin-in-context-editor/src/index.ts",
};

/** Package-internal path aliases, re-declared so consuming apps can resolve them. */
const internalAliases: Record<string, string> = {
  // Note: '@' alias for plugin-in-context-editor is internal only (not exported to consuming apps)
};

/** Packages built by non-Vite tooling, so they must be watched rather than source-imported. */
const defaultWatchPackages = [
  "@comvi/next", // Uses tsup with "use client" directive
  "@comvi/plugin-in-context-editor", // Complex Vue plugin with CSS injection
];

export interface ComviDevOptions {
  /**
   * Path to the monorepo root from the consuming app
   * @example '../..' for test-apps/vue
   */
  rootDir: string;

  /**
   * Packages watched for dist/ changes instead of imported from src/.
   * @default ['@comvi/next']
   */
  watchPackages?: string[];
}

/**
 * Vite configuration for transparent HMR with workspace packages: development
 * resolves them to source, production uses normal dist resolution.
 *
 * @example
 * // test-apps/vue/vite.config.ts
 * import { defineConfig, mergeConfig } from 'vite'
 * import vue from '@vitejs/plugin-vue'
 * import { comviDevConfig } from '@comvi/vite-config'
 *
 * export default mergeConfig(
 *   comviDevConfig({ rootDir: '../..' }),
 *   defineConfig({ plugins: [vue()] })
 * )
 */
export function comviDevConfig(options: ComviDevOptions): UserConfig {
  const { rootDir, watchPackages = defaultWatchPackages } = options;

  const isDev = process.env.NODE_ENV !== "production";
  const resolvedRootDir = resolve(process.cwd(), rootDir);

  const aliases: Record<string, string> = {};
  const excludeFromOptimize: string[] = [];

  if (isDev) {
    for (const [pkg, srcPath] of Object.entries(sourcePackages)) {
      if (!watchPackages.includes(pkg)) {
        aliases[pkg] = resolve(resolvedRootDir, srcPath);
        excludeFromOptimize.push(pkg);
      }
    }
    for (const [alias, srcPath] of Object.entries(internalAliases)) {
      aliases[alias] = resolve(resolvedRootDir, srcPath);
    }
    // Watch packages are excluded from pre-bundling too, so each change is a fresh import.
    excludeFromOptimize.push(...watchPackages);
  }

  return {
    resolve: {
      alias: aliases,
    },
    optimizeDeps: {
      exclude: excludeFromOptimize,
    },
    server: {
      fs: {
        allow: [resolvedRootDir],
      },
      watch: {
        // Vite ignores node_modules by default; the workspace packages have to be watched.
        ignored: ["!**/node_modules/@comvi/**"],
      },
    },
  };
}

/**
 * TypeScript path mappings for workspace packages, for tsconfig.json `paths`.
 *
 * @example
 * const paths = generateTsPaths('../..')
 * // { '@comvi/core': ['../../packages/core/src/index.ts'], ... }
 */
export function generateTsPaths(rootDir: string): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const [pkg, srcPath] of Object.entries(sourcePackages)) {
    paths[pkg] = [resolve(rootDir, srcPath)];
  }
  return paths;
}

export const sourceImportablePackages = Object.keys(sourcePackages);

export const watchModePackages = defaultWatchPackages;

export const treeshakeOptions = {
  moduleSideEffects: false,
  propertyReadSideEffects: false as const,
};

/**
 * Every `@comvi/core` specifier a framework wrapper may name, as a bundler
 * external list.
 *
 * A wrapper that externalizes only the bare specifier gets verbatim COPIES of
 * core's chunks inlined into its own dist: `@comvi/vue` once shipped a
 * duplicate tag graph that could not dedupe with the app's own `@comvi/core`
 * and ran core's ambient `registerTagSyntax()` from inside the vue bundle. The
 * list is shared because forgetting one entry fails silently and expensively.
 */
export const COMVI_CORE_EXTERNALS = [
  "@comvi/core",
  "@comvi/core/icu",
  "@comvi/core/loader",
  "@comvi/core/plugins",
  "@comvi/core/devtools",
  // The PURE rich-text seam every wrapper `<T>` imports, and its ambient
  // counterpart. Both must be external: inlining `rich-text` gives the wrapper a
  // private copy of the `<T>` pipeline that cannot dedupe with the app's
  // `@comvi/core`, and inlining `tags` re-creates the duplicate-graph bug above.
  "@comvi/core/rich-text",
  "@comvi/core/tags",
];

export interface LibraryBuildOptions {
  /** Library entry point */
  entry: string;
  /** Library name (for UMD/IIFE builds) */
  name: string;
  /** Output file name for the ESM build: { es: 'lib.js' }. `cjs` is accepted but ignored (the libraries are ESM-only). */
  fileNames: { es: string; cjs?: string };
  /** External dependencies (peer deps) */
  external?: string[];
  /** Globals for UMD builds */
  globals?: Record<string, string>;
  /** Emitted name pattern for non-entry chunks. Required when `pinnedChunks` is used. */
  chunkFileNames?: string;
  /**
   * Source modules to keep OUT of the entry chunk, each in a chunk of its own.
   *
   * A single-file dist makes every top-level import of the bundle an import of
   * the app: a module whose only job is to carry an optional, side-effectful
   * dependency (`<T>` → `@comvi/core/tags`) pins that dependency into every
   * consumer, because the entry module is always used. Splitting it out turns
   * the entry's re-export into a prunable named binding — provided the package
   * declares `sideEffects: false`.
   */
  pinnedChunks?: { name: string; test: RegExp }[];
}

/**
 * Standard build options for library packages.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { createLibraryBuildOptions } from '@comvi/vite-config'
 *
 * export default defineConfig({
 *   build: createLibraryBuildOptions({
 *     entry: resolve(__dirname, 'src/index.ts'),
 *     name: 'ComviCore',
 *     fileNames: { es: 'comvi-core.js', cjs: 'comvi-core.cjs' },
 *   }),
 * })
 * ```
 */
export function createLibraryBuildOptions(options: LibraryBuildOptions): BuildOptions {
  const {
    entry,
    name,
    fileNames,
    external = [],
    globals = {},
    chunkFileNames,
    pinnedChunks,
  } = options;

  if (pinnedChunks !== undefined && chunkFileNames === undefined) {
    throw new Error("createLibraryBuildOptions: `pinnedChunks` requires `chunkFileNames`");
  }

  return {
    emptyOutDir: !isWatchMode,
    lib: {
      entry,
      name,
    },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      external,
      // Required by rolldown whenever `includeDependenciesRecursively` is
      // false; harmless for a library whose entry exports are pinned by its
      // own index module.
      ...(pinnedChunks === undefined
        ? {}
        : { preserveEntrySignatures: "allow-extension" as const }),
      output: [
        {
          format: "es",
          entryFileNames: fileNames.es,
          globals,
          ...(chunkFileNames === undefined ? {} : { chunkFileNames }),
          ...(pinnedChunks === undefined
            ? {}
            : {
                codeSplitting: {
                  // Recursive capture would drag the pinned module's shared
                  // dependencies out of the entry chunk with it.
                  includeDependenciesRecursively: false,
                  groups: pinnedChunks.map((chunk) => ({
                    name: chunk.name,
                    test: chunk.test,
                    minSize: 0,
                    minShareCount: 1,
                  })),
                },
              }),
        },
      ],
      treeshake: treeshakeOptions,
    },
  };
}

export interface PluginBuildOptions {
  /** Plugin entry point */
  entry: string;
  /** Plugin name (for UMD builds) */
  name?: string;
  /** Output file name for the ESM build: { es: 'index.js' }. `cjs` is accepted but ignored (ESM-only). */
  fileNames?: { es: string; cjs?: string };
  /** External dependencies */
  external?: string[];
}

/**
 * Build options for plugin packages.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { createPluginBuildOptions } from '@comvi/vite-config'
 *
 * export default defineConfig({
 *   build: createPluginBuildOptions({
 *     entry: resolve(__dirname, 'src/index.ts'),
 *     external: ['@comvi/core'],
 *   }),
 * })
 * ```
 */
export function createPluginBuildOptions(options: PluginBuildOptions): BuildOptions {
  const {
    entry,
    name = "ComviPlugin",
    fileNames = { es: "index.js" },
    external = ["@comvi/core"],
  } = options;

  return {
    emptyOutDir: !isWatchMode,
    lib: {
      entry,
      name,
    },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      external,
      output: [
        {
          format: "es",
          entryFileNames: fileNames.es,
        },
      ],
      treeshake: treeshakeOptions,
    },
  };
}
