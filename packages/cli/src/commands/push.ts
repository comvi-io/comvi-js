/**
 * Push command - Upload local translations to TMS
 *
 * Usage:
 *   comvi push                         # All files
 *   comvi push --lang en               # Only specified language
 *   comvi push --dry-run               # Preview changes without applying
 *   comvi push --force-mode override   # Overwrite existing translations
 *   comvi push --force-mode keep       # Keep existing translations
 */

import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ConfigLoader } from "../core/ConfigLoader";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";
import type { ForceMode } from "../types";

type ApiPushForceMode = Exclude<ForceMode, "ask">;

export function createPushCommand(): Command {
  return new Command("push")
    .description("Upload local translations to TMS")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-l, --lang <languages>", "Filter by languages (comma-separated)")
    .option("-n, --ns <namespaces>", "Filter by namespaces (comma-separated)")
    .option("-p, --path <path>", "Override translations source path")
    .option("--dry-run", "Preview changes without applying")
    .option("--force-mode <mode>", "Conflict resolution: override, keep, ask, abort", "ask")
    .action(async (options) => {
      try {
        console.log("🔄 Loading configuration...");

        // Load configuration (validates apiKey is present)
        const config = await ConfigLoader.load(options.config);

        // apiKey is validated by ConfigLoader.load(), so it's guaranteed to be set
        if (!config.apiKey) {
          throw new Error("API key is required. Set COMVI_API_KEY environment variable.");
        }

        // Create API client
        const apiClient = new ApiClient({
          apiKey: config.apiKey,
          apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
        });

        // Create translation sync
        const sync = new TranslationSync({
          translationsPath: options.path || config.translationsPath || "./src/locales",
          fileTemplate: config.fileTemplate || "{languageTag}/{namespace}.json",
          format: config.format || "json",
        });

        // Parse filter options
        const languages = options.lang?.split(",").map((l: string) => l.trim());
        const namespaces = options.ns?.split(",").map((n: string) => n.trim());

        // Determine force mode
        const forceMode: ForceMode = options.forceMode || config.push?.forceMode || "ask";

        // Validate force mode
        if (!["override", "keep", "ask", "abort"].includes(forceMode)) {
          console.error(`✗ Invalid force-mode: ${forceMode}. Use: override, keep, ask, or abort`);
          process.exit(1);
        }

        // Read local translations
        console.log("🔄 Reading local translation files...");
        const localTranslations = await sync.readTranslations({
          languages,
          namespaces,
        });

        if (Object.keys(localTranslations.translations).length === 0) {
          console.log("⚠  No translation files found");
          process.exit(0);
        }

        // Dry run mode
        if (options.dryRun) {
          console.log("\n📦 Push preview (dry run):");

          // Fetch current TMS state to compare
          const remoteTranslations = await apiClient.fetchTranslations({
            languages,
            namespaces,
          });

          const diff = sync.compareTranslations(
            localTranslations.translations,
            remoteTranslations.translations,
          );

          console.log(`  ✅ Created: ${diff.created} keys`);
          console.log(`  📝 Updated: ${diff.updated} translations`);
          console.log(`  ⚠️  Conflicts: ${diff.conflicts} keys`);

          if (diff.conflicts > 0) {
            console.log(`\n  Run with --force-mode override to overwrite remote values.`);
            console.log(`  Run with --force-mode keep to upload only non-conflicting values.`);
          }

          process.exit(0);
        }

        let apiForceMode: ApiPushForceMode =
          forceMode === "ask" ? "override" : (forceMode as ApiPushForceMode);
        let preloadedRemote;
        if (forceMode === "ask") {
          const remoteTranslations = await apiClient.fetchTranslations({
            languages,
            namespaces,
          });
          preloadedRemote = remoteTranslations;
          const diff = sync.compareTranslations(
            localTranslations.translations,
            remoteTranslations.translations,
          );

          apiForceMode = await promptConflictResolution(diff.conflicts);
        }

        // Actual push
        console.log("🔄 Pushing translations to TMS...");

        const result = await apiClient.pushTranslations({
          translations: localTranslations.translations,
          forceMode: apiForceMode,
          preloadedRemote,
          onProgress: createPushProgressReporter(),
        });

        console.log(`\n✓ Push complete!`);
        console.log(`  Created: ${result.created} keys`);
        console.log(`  Updated: ${result.updated} translations`);
        if (result.skipped > 0) {
          console.log(`  Skipped: ${result.skipped} (conflicts with keep mode)`);
        }

        process.exit(0);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Push failed: ${error.message}`);
        }
        process.exit(1);
      }
    });
}

function createPushProgressReporter(): (progress: {
  total: number;
  completed: number;
  created: number;
  updated: number;
  skipped: number;
}) => void {
  let lastReported = 0;

  return (progress) => {
    if (progress.total === 0) {
      return;
    }

    const shouldReport =
      progress.completed === progress.total || progress.completed - lastReported >= 100;

    if (!shouldReport) {
      return;
    }

    lastReported = progress.completed;
    console.log(
      `  Progress: ${progress.completed}/${progress.total} ` +
        `(created: ${progress.created}, updated: ${progress.updated}, skipped: ${progress.skipped})`,
    );
  };
}

async function promptConflictResolution(conflictCount: number): Promise<ApiPushForceMode> {
  if (conflictCount === 0) {
    return "override";
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "--force-mode ask requires an interactive terminal. Use --force-mode override, keep, or abort.",
    );
  }

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const answer = (
        await rl.question(
          `Found ${conflictCount} conflicting translations. Choose: [o]verride, [k]eep, [a]bort: `,
        )
      )
        .trim()
        .toLowerCase();

      if (answer === "o" || answer === "override") {
        return "override";
      }
      if (answer === "k" || answer === "keep") {
        return "keep";
      }
      if (answer === "a" || answer === "abort") {
        return "abort";
      }

      console.log("Please enter override, keep, or abort.");
    }
  } finally {
    rl.close();
  }
}
