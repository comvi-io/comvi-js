import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";
import { DEFAULT_FILE_TEMPLATE, isDefaultFileTemplate } from "../defaults";
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
    .option("--dry-run", "Show what would be written without touching files")
    .action(async (options) => {
      try {
        console.log("🔄 Loading configuration...");

        const config = await ConfigLoader.load(options.config);

        // apiKey is validated by ConfigLoader.load(), so it's guaranteed to be set
        if (!config.apiKey) {
          throw new Error("API key is required. Set COMVI_API_KEY environment variable.");
        }

        const apiClient = new ApiClient({
          apiKey: config.apiKey,
          apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
        });

        const fileTemplate = config.fileTemplate || DEFAULT_FILE_TEMPLATE;
        const sync = new TranslationSync({
          translationsPath: options.path || config.translationsPath || "./src/locales",
          fileTemplate,
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

        if (options.emptyDir || config.pull?.emptyDir) {
          if (options.dryRun) {
            console.log("🗑️  [dry-run] Would clear translations directory");
          } else {
            console.log("🗑️  Clearing translations directory...");
            await sync.clearDirectory();
          }
        }

        console.log("🔄 Fetching translations from TMS...");
        const translations = await apiClient.fetchTranslations({
          locales: locs.value,
          namespaces: nss.value,
        });

        // Diff request vs response so a typo (in config or --ns/--locale) fails
        // fast with exit 4 instead of producing empty translation files in CI.
        assertAllReturned("namespaces", nss.value, translations.namespaces);
        assertAllReturned("locales", locs.value, translations.locales);

        const defaultNamespace = isDefaultFileTemplate(fileTemplate)
          ? await apiClient.fetchDefaultNamespace()
          : undefined;

        if (options.dryRun) {
          const preview = sync.previewTranslations(translations, { defaultNamespace });
          console.log(`\n✓ [dry-run] Would write ${preview.files.length} files:`);
          for (const file of preview.files) {
            console.log(`  ${file}`);
          }
          process.exit(0);
        }

        console.log("📝 Writing translation files...");
        const result = await sync.writeTranslations(translations, { defaultNamespace });

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
