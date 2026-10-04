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
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveAugmentationTarget } from "@comvi/typegen";
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
   * With the default template, root JSON files (en.json, fr.json) are
   * treated as the default namespace and other namespaces use
   * {namespace}/{languageTag}.json.
   * @default '{namespace}/{languageTag}.json'
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

  /**
   * Module the generated declarations augment.
   *
   * Left out, it is the Comvi package this project declares in its
   * `package.json`: `@comvi/core` when it is a dependency, otherwise the
   * framework binding (`@comvi/react`, `@comvi/next`, `@comvi/vue`,
   * `@comvi/nuxt`, `@comvi/svelte`, `@comvi/solid`). Set it to name a private
   * wrapper package that re-exports one of those instead.
   */
  augment?: string;
}

export function comviTypes(options: ComviTypesOptions): Plugin {
  const {
    translations,
    output = "./src/types/i18n.d.ts",
    fileTemplate,
    defaultNs,
    strictParams,
    augment,
  } = options;

  let resolvedTranslationsPath: string;
  let resolvedOutputPath: string;
  let resolvedRoot: string;
  let isBuildCommand = false;
  let lastContent = "";

  const emitOptions: EmitOptions = {
    defaultNs,
    strictParams,
  };

  async function generate(options: { throwOnError: boolean }): Promise<void> {
    try {
      // Which module the declarations augment is a property of the project, so
      // it is read from the Vite root's manifest — the same answer `comvi
      // typegen` reads, on every machine and under every package manager. A
      // project that declares no Comvi package has nothing to augment, and a
      // file augmenting an unresolvable module is silently inert: TypeScript
      // reports TS2882 on the generated import and `skipLibCheck: true` hides
      // even that. Resolved before anything is written.
      const augmentTarget = resolveAugmentationTarget(resolvedRoot, augment);

      const schema = await extractSchema({
        translationsPath: resolvedTranslationsPath,
        fileTemplate,
        defaultNs,
        // A key whose message carries ICU syntax core does not implement gets
        // no parameters, because the ingestion preflight refuses the whole key
        // at runtime. Said out loud here: the alternative is a key that looks
        // typed, takes no arguments, and throws on first render.
        onIssue: ({ key, filePath, argumentType, value }) => {
          console.warn(
            `[@comvi/vite-plugin] "${key}" in ${path.relative(resolvedRoot, filePath)} uses the ICU ` +
              `\`${argumentType}\` argument type, which @comvi/core does not implement, so no ` +
              `parameters were generated for it: ${JSON.stringify(value)}`,
          );
        },
      });

      const content = emitDeclarations(schema, { ...emitOptions, augment: augmentTarget });

      // Skipping the unchanged write avoids a TS re-check storm in dev.
      if (content === lastContent) return;

      await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
      await writeAtomically(resolvedOutputPath, content);
      // Only once the file has landed: a failed write remembered as written
      // would make the identical retry skip, and the file would never appear.
      lastContent = content;
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
      resolvedRoot = config.root;
      resolvedTranslationsPath = path.resolve(config.root, translations);
      resolvedOutputPath = path.resolve(config.root, output);
      isBuildCommand = config.command === "build";
    },

    async buildStart() {
      await scheduleGenerate({ throwOnError: isBuildCommand });
    },

    configureServer(server) {
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

/**
 * Write a sibling temp file (`wx`: never one that already exists) and rename it
 * over the target, so a failure partway never truncates the declarations the
 * editor is already using. The temp file is removed when anything fails.
 */
async function writeAtomically(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, content, { encoding: "utf-8", flag: "wx" });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export type { ProjectSchema, SchemaParam, KeySchema } from "./extract";
export type { EmitOptions } from "./emit";
