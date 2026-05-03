import { resolve } from "path";
import type { UserConfig, BuildOptions } from "vite";

// In watch mode we keep dist files between rebuilds to avoid transient
// module resolution failures in consuming apps.
const isWatchMode = process.argv.includes("--watch");

/**
 * Map of workspace packages to their source entry points
 * These packages will be resolved to source for instant HMR in development
 */
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

/**
 * Internal aliases for packages with their own path aliases
 * These aliases are added to consuming apps to resolve internal imports
 */
const internalAliases: Record<string, string> = {
  // Note: '@' alias for plugin-in-context-editor is internal only (not exported to consuming apps)
};

/**
 * Packages that require watch mode instead of source imports
 * These use non-Vite build tools (e.g., tsup) or have complex build requirements
 */
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
   * Packages that should use watch mode instead of source imports
   * These packages will be watched for dist/ changes instead of importing from src/
   * @default ['@comvi/next']
   */
  watchPackages?: string[];
}

/**
 * Creates Vite configuration for transparent HMR with workspace packages
 *
 * In development mode:
 * - Resolves workspace packages to their source files for instant HMR
 * - Configures file system access for workspace packages
 * - Watches dist/ for packages using watch mode
 *
 * In production mode:
 * - Uses normal package resolution (dist/ files)
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

  // Build aliases for source imports (dev only)
  const aliases: Record<string, string> = {};
  const excludeFromOptimize: string[] = [];

  if (isDev) {
    for (const [pkg, srcPath] of Object.entries(sourcePackages)) {
      if (!watchPackages.includes(pkg)) {
        aliases[pkg] = resolve(resolvedRootDir, srcPath);
        excludeFromOptimize.push(pkg);
      }
    }
    // Add internal aliases for packages with their own path aliases
    for (const [alias, srcPath] of Object.entries(internalAliases)) {
      aliases[alias] = resolve(resolvedRootDir, srcPath);
    }
    // Also exclude watch packages from pre-bundling to ensure fresh imports
    excludeFromOptimize.push(...watchPackages);
  }

  return {
    resolve: {
      alias: aliases,
    },
    optimizeDeps: {
      // Exclude all workspace packages from pre-bundling
      // - Source-imported packages: resolved via aliases
      // - Watch packages: need fresh imports on each change
      exclude: excludeFromOptimize,
    },
    server: {
      fs: {
        // Allow serving files from workspace packages
        allow: [resolvedRootDir],
      },
      watch: {
        // Ensure Vite watches workspace packages in node_modules
        // By default Vite ignores node_modules, we need to watch our packages
        ignored: ["!**/node_modules/@comvi/**"],
      },
    },
  };
}

/**
 * Generates TypeScript path mappings for workspace packages
 * Use this to update tsconfig.json paths for proper IDE support
 *
 * @example
 * // Generate paths for tsconfig.json
 * const paths = generateTsPaths('../..')
 * // Returns: { '@comvi/core': ['../../packages/core/src/index.ts'], ... }
 */
export function generateTsPaths(rootDir: string): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const [pkg, srcPath] of Object.entries(sourcePackages)) {
    paths[pkg] = [resolve(rootDir, srcPath)];
  }
  return paths;
}

/**
 * List of all source-importable packages
 * Useful for conditional configuration
 */
export const sourceImportablePackages = Object.keys(sourcePackages);

/**
 * Default packages that use watch mode
 */
export const watchModePackages = defaultWatchPackages;

// ============================================================================
// Library Build Configuration
// ============================================================================

/**
 * Standard treeshake options
 */
export const treeshakeOptions = {
  moduleSideEffects: false,
  propertyReadSideEffects: false as const,
};

/**
 * Terser options for packages that need aggressive minification (e.g. core)
 */
export const terserOptions = {
  compress: {
    drop_console: true,
    drop_debugger: true,
    pure_funcs: ["console.log", "console.warn"],
    passes: 2,
    ecma: 2020 as const,
    unsafe: true,
    unsafe_comps: true,
    unsafe_methods: true,
    unsafe_proto: true,
  },
  mangle: {
    safari10: true,
    properties: false,
  },
  format: {
    comments: false,
    ecma: 2020 as const,
  },
};

/**
 * Oxc minifier options for aggressive minification
 */
export const oxcMinifyOptions = {
  compress: {
    target: "es2020",
    dropConsole: true,
    dropDebugger: true,
    unused: true,
    joinVars: true,
    sequences: true,
    treeshake: {
      annotations: true,
      manualPureFunctions: ["console.log", "console.warn"],
      propertyReadSideEffects: false,
      unknownGlobalSideEffects: false,
    },
  },
  mangle: {
    toplevel: true,
    keepNames: false,
  },
  codegen: {
    removeWhitespace: true,
  },
};

export interface LibraryBuildOptions {
  /** Library entry point */
  entry: string;
  /** Library name (for UMD/IIFE builds) */
  name: string;
  /** Output file names: { es: 'lib.js', cjs: 'lib.cjs' } */
  fileNames: { es: string; cjs: string };
  /** External dependencies (peer deps) */
  external?: string[];
  /** Globals for UMD builds */
  globals?: Record<string, string>;
}

/**
 * Creates standard build options for library packages
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
  const { entry, name, fileNames, external = [], globals = {} } = options;

  return {
    emptyOutDir: !isWatchMode,
    lib: {
      entry,
      name,
    },
    minify: true,
    rolldownOptions: {
      external,
      output: [
        {
          format: "es",
          entryFileNames: fileNames.es,
          globals,
          minify: oxcMinifyOptions,
        },
        {
          format: "cjs",
          entryFileNames: fileNames.cjs,
          globals,
          minify: oxcMinifyOptions,
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
  /** Output file names: { es: 'index.js', cjs: 'index.cjs' } */
  fileNames?: { es: string; cjs: string };
  /** External dependencies */
  external?: string[];
}

/**
 * Creates build options for plugin packages (ESM + CJS)
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
    fileNames = { es: "index.js", cjs: "index.cjs" },
    external = ["@comvi/core"],
  } = options;

  return {
    emptyOutDir: !isWatchMode,
    lib: {
      entry,
      name,
    },
    minify: true,
    rolldownOptions: {
      external,
      output: [
        {
          format: "es",
          entryFileNames: fileNames.es,
          minify: oxcMinifyOptions,
        },
        {
          format: "cjs",
          entryFileNames: fileNames.cjs,
          minify: oxcMinifyOptions,
        },
      ],
      treeshake: treeshakeOptions,
    },
  };
}
