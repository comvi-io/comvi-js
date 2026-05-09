/**
 * Pull command - Download translations from TMS to local files
 *
 * Usage:
 *   comvi pull                         # All locales, all namespaces
 *   comvi pull --locale en,uk          # Filter by locales
 *   comvi pull --ns common,admin       # Filter by namespaces
 *   comvi pull --path ./locales        # Override output path
 *   comvi pull --empty-dir             # Clear directory before pull
 */

import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";
import { ErrorCodes, isTypegenError } from "../utils/errors";
import { assertAllReturned, parseListFlag, resolveFilter } from "../utils/filterResolution";

const EXIT_VALIDATION = 4;

export function createPullCommand(): Command {
  return new Command("pull")
    .description("Download translations from TMS to local files")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-l, --locale <locales>", "Filter by locales (comma-separated)")
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

        // Resolve filters: CLI flag > config > all (no merge).
        const locs = resolveFilter(parseListFlag(options.locale), config.locales);
        const nss = resolveFilter(parseListFlag(options.ns), config.namespaces);

        if (locs.source === "config") {
          console.log(`📄 Using locales from .comvirc.json: ${locs.value!.join(", ")}`);
        }
        if (nss.source === "config") {
          console.log(`📄 Using namespaces from .comvirc.json: ${nss.value!.join(", ")}`);
        }

        // Empty directory if requested
        if (options.emptyDir || config.pull?.emptyDir) {
          console.log("🗑️  Clearing translations directory...");
          await sync.clearDirectory();
        }

        // Fetch translations
        console.log("🔄 Fetching translations from TMS...");
        const translations = await apiClient.fetchTranslations({
          locales: locs.value,
          namespaces: nss.value,
        });

        // Diff request vs response so a typo (in config or --ns/--locale) fails
        // fast with exit 4 instead of producing empty translation files in CI.
        assertAllReturned("namespaces", nss.value, translations.namespaces);
        assertAllReturned("locales", locs.value, translations.locales);

        // Write to files
        console.log("📝 Writing translation files...");
        const result = await sync.writeTranslations(translations);

        console.log(`\n✓ Pull complete!`);
        console.log(`  Locales: ${result.locales.join(", ")}`);
        console.log(`  Namespaces: ${result.namespaces.join(", ")}`);
        console.log(`  Files written: ${result.filesWritten}`);

        process.exit(0);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Pull failed: ${error.message}`);
        }
        if (
          isTypegenError(error, ErrorCodes.VALIDATION_FAILED) ||
          isTypegenError(error, ErrorCodes.CONFIG_INVALID)
        ) {
          process.exit(EXIT_VALIDATION);
        }
        process.exit(1);
      }
    });
}
