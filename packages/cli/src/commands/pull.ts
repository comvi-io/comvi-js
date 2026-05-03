/**
 * Pull command - Download translations from TMS to local files
 *
 * Usage:
 *   comvi pull                         # All languages, all namespaces
 *   comvi pull --lang en,uk            # Filter by languages
 *   comvi pull --ns common,admin       # Filter by namespaces
 *   comvi pull --path ./locales        # Override output path
 *   comvi pull --empty-dir             # Clear directory before pull
 */

import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";

export function createPullCommand(): Command {
  return new Command("pull")
    .description("Download translations from TMS to local files")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-l, --lang <languages>", "Filter by languages (comma-separated)")
    .option("-n, --ns <namespaces>", "Filter by namespaces (comma-separated)")
    .option("-p, --path <path>", "Override translations output path")
    .option("--empty-dir", "Clear directory before pull")
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

        // Empty directory if requested
        if (options.emptyDir || config.pull?.emptyDir) {
          console.log("🗑️  Clearing translations directory...");
          await sync.clearDirectory();
        }

        // Fetch translations
        console.log("🔄 Fetching translations from TMS...");
        const translations = await apiClient.fetchTranslations({
          languages,
          namespaces,
        });

        // Write to files
        console.log("📝 Writing translation files...");
        const result = await sync.writeTranslations(translations);

        console.log(`\n✓ Pull complete!`);
        console.log(`  Languages: ${result.languages.join(", ")}`);
        console.log(`  Namespaces: ${result.namespaces.join(", ")}`);
        console.log(`  Files written: ${result.filesWritten}`);

        process.exit(0);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Pull failed: ${error.message}`);
        }
        process.exit(1);
      }
    });
}
