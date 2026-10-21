import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { timeoutsFromEnv } from "../core/timeouts";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";
import { DEFAULT_FILE_TEMPLATE, isDefaultFileTemplate } from "../defaults";
import { ErrorCodes, EXIT_VALIDATION, isTypegenError } from "../utils/errors";
import { assertAllReturned, parseListFlag, resolveFilter } from "../utils/filterResolution";

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
          ...timeoutsFromEnv(),
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

        // Judge every name and every resolved path before the clear: the clear
        // runs first, so a name the CLI refuses mid-write would delete the
        // catalog and restore only part of it.
        await sync.assertWritable(translations, { defaultNamespace });

        // The clear runs only once the fetch has returned everything that was
        // asked for, and only over the locales and namespaces being pulled: a
        // failed request, or one missing a requested namespace, must leave the
        // working copy exactly as it was.
        const emptyDir = Boolean(options.emptyDir || config.pull?.emptyDir);
        const scope = {
          locales: locs.value,
          namespaces: nss.value,
          defaultNamespace,
        };

        if (options.dryRun) {
          if (emptyDir) {
            const removable = await sync.previewClear(scope);
            console.log(`\n🗑️  [dry-run] Would remove ${removable.length} files:`);
            for (const file of removable) {
              console.log(`  ${file}`);
            }
          }
          const preview = sync.previewTranslations(translations, { defaultNamespace });
          console.log(`\n✓ [dry-run] Would write ${preview.files.length} files:`);
          for (const file of preview.files) {
            console.log(`  ${file}`);
          }
          process.exit(0);
        }

        let result;
        if (emptyDir) {
          // Clear and write as one operation: a write that fails partway
          // restores the catalog as it was before the pull.
          console.log("🗑️  Clearing translations directory...");
          console.log("📝 Writing translation files...");
          result = await sync.replaceTranslations(translations, scope, { defaultNamespace });
        } else {
          console.log("📝 Writing translation files...");
          result = await sync.writeTranslations(translations, { defaultNamespace });
        }

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
