/**
 * @comvi/vite-plugin
 *
 * Vite plugin that auto-generates TypeScript types from local translation files.
 * Watches JSON files during dev, generates once during build.
 *
 * @example
 * ```typescript
 * import { comviTypes } from '@comvi/vite-plugin'
 *
 * export default defineConfig({
 *   plugins: [
 *     comviTypes({
 *       translations: './src/locales',
 *       output: './src/types/i18n.d.ts',
 *     })
 *   ]
 * })
 * ```
 */

import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { extractSchema } from "./extract";
import { emitDeclarations, type EmitOptions } from "./emit";
import { createGenerationScheduler } from "./scheduler";

export interface ComviTypesOptions {
  /**
   * Path to the directory containing translation JSON files.
   * @example './src/locales'
   */
  translations: string;

  /**
   * Path where the generated .d.ts file will be written.
   * @default './src/types/i18n.d.ts'
   */
  output?: string;

  /**
   * File template pattern for matching translation files.
   * Use {languageTag} and {namespace} placeholders.
   *
   * For single-file-per-language (en.json, fr.json), leave undefined.
   * @default '{languageTag}/{namespace}.json'
   */
  fileTemplate?: string;

  /**
   * Default namespace — keys from this namespace won't have a prefix.
   * @default 'default'
   */
  defaultNs?: string;

  /**
   * Make params required (true) or optional (false).
   * @default true
   */
  strictParams?: boolean;
}

export function comviTypes(options: ComviTypesOptions): Plugin {
  const {
    translations,
    output = "./src/types/i18n.d.ts",
    fileTemplate,
    defaultNs,
    strictParams,
  } = options;

  let resolvedTranslationsPath: string;
  let resolvedOutputPath: string;
  let isBuildCommand = false;
  let lastContent = "";

  const emitOptions: EmitOptions = {
    defaultNs,
    strictParams,
  };

  async function generate(options: { throwOnError: boolean }): Promise<void> {
    try {
      const schema = await extractSchema({
        translationsPath: resolvedTranslationsPath,
        fileTemplate,
        defaultNs,
      });

      const content = emitDeclarations(schema, emitOptions);

      // Only write if content changed (avoid unnecessary TS re-checks)
      if (content === lastContent) return;
      lastContent = content;

      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
      await fs.writeFile(resolvedOutputPath, content, "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[@comvi/vite-plugin] Failed to generate types: ${message}`);
      if (options.throwOnError) {
        throw error;
      }
    }
  }

  const scheduleGenerate = createGenerationScheduler(generate);

  function shouldRegenerateForFile(file: string): boolean {
    if (!file.endsWith(".json")) {
      return false;
    }

    const relative = path.relative(resolvedTranslationsPath, file);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  return {
    name: "comvi-types",
    enforce: "pre",

    configResolved(config) {
      resolvedTranslationsPath = path.resolve(config.root, translations);
      resolvedOutputPath = path.resolve(config.root, output);
      isBuildCommand = config.command === "build";
    },

    async buildStart() {
      await scheduleGenerate({ throwOnError: isBuildCommand });
    },

    configureServer(server) {
      // Watch translation files for changes during dev
      server.watcher.add(resolvedTranslationsPath);
      const triggerGenerate = (file: string) => {
        if (shouldRegenerateForFile(file)) {
          void scheduleGenerate({ throwOnError: false });
        }
      };

      server.watcher.on("change", triggerGenerate);
      server.watcher.on("add", triggerGenerate);
      server.watcher.on("unlink", triggerGenerate);
    },
  };
}

export type { ProjectSchema, SchemaParam, KeySchema } from "./extract";
export type { EmitOptions } from "./emit";
