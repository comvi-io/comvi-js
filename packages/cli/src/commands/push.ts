import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ConfigLoader } from "../core/ConfigLoader";
import { timeoutsFromEnv } from "../core/timeouts";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";
import {
  DEFAULT_FILE_TEMPLATE,
  isDefaultFileTemplate,
  DEFAULT_TRANSLATIONS_PATH,
} from "../defaults";
import type { ForceMode } from "../types";
import { ErrorCodes, EXIT_VALIDATION, exitCodeFor, TypegenError } from "../utils/errors";
import { resolveLocales } from "../utils/locales";
import { parseListFlag, resolveFilter } from "../utils/filterResolution";

type ApiPushForceMode = Exclude<ForceMode, "ask">;

export function createPushCommand(): Command {
  return new Command("push")
    .description("Upload local translations to TMS")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-l, --locale <locales>", "Filter by locales (comma-separated)")
    .option("-n, --ns <namespaces>", "Filter by namespaces (comma-separated)")
    .option("-p, --path <path>", "Override translations source path")
    .option("--dry-run", "Preview changes without applying")
    .option("--force-mode <mode>", "Conflict resolution: override, keep, ask, abort (default: ask)")
    .option(
      "--skip-unknown-locales",
      "Push the other locales when local files hold locales the project does not have",
    )
    .option("--allow-empty", "Succeed when there are no translation files to push")
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
          translationsPath: options.path || config.translationsPath || DEFAULT_TRANSLATIONS_PATH,
          fileTemplate,
          format: config.format || "json",
        });

        // Resolve filters: CLI flag > config > all (no merge).
        const locs = resolveFilter(parseListFlag(options.locale, "--locale"), config.locales);
        const nss = resolveFilter(parseListFlag(options.ns, "--ns"), config.namespaces);
        const locales = locs.value;
        const namespaces = nss.value;

        if (locs.source === "config") {
          console.log(`📄 Using locales from .comvirc.json: ${locs.value!.join(", ")}`);
        }
        if (nss.source === "config") {
          console.log(`📄 Using namespaces from .comvirc.json: ${nss.value!.join(", ")}`);
        }

        // Resolution: CLI flag > config > "ask". `--force-mode` deliberately declares no
        // commander default; a default is always set, so it would shadow config.push.forceMode.
        const forceMode: ForceMode = options.forceMode || config.push?.forceMode || "ask";

        if (!["override", "keep", "ask", "abort"].includes(forceMode)) {
          console.error(`✗ Invalid force-mode: ${forceMode}. Use: override, keep, ask, or abort`);
          process.exit(EXIT_VALIDATION);
        }

        const defaultNamespace = isDefaultFileTemplate(fileTemplate)
          ? await apiClient.fetchDefaultNamespace()
          : undefined;

        console.log("🔄 Reading local translation files...");
        const localTranslations = await sync.readTranslations({
          locales,
          namespaces,
          defaultNamespace,
        });

        // Judge the local locales before anything is written: a locale the
        // project does not have would otherwise be dropped by the platform
        // while the push reports success.
        const translations = localTranslations.translations;
        const projectLocales =
          Object.keys(translations).length > 0 ? await apiClient.fetchProjectLocales() : [];
        const resolution = resolveLocales(Object.keys(translations), projectLocales ?? []);
        if (resolution.duplicates.length > 0) {
          const clashes = resolution.duplicates
            .map(({ locale, spellings }) => `${spellings.join(" and ")} (both ${locale})`)
            .join("; ");
          throw new TypegenError(
            `Two local files hold the same locale: ${clashes}. Keep one spelling.`,
            ErrorCodes.VALIDATION_FAILED,
          );
        }
        if (projectLocales === undefined) {
          console.error(
            "⚠  The platform did not list its locales; local locales were not checked before the push.",
          );
        } else {
          if (resolution.unknown.length > 0) {
            const list = resolution.unknown.join(", ");
            if (!options.skipUnknownLocales) {
              throw new TypegenError(
                `Local locales the project does not have, or this API key may not write: ${list}. ` +
                  "Add them to the project, or pass --skip-unknown-locales to push the rest.",
                ErrorCodes.VALIDATION_FAILED,
              );
            }
            console.error(`⚠  Skipping locales the project does not have: ${list}`);
            for (const locale of resolution.unknown) {
              delete translations[locale];
            }
          }
          for (const [local, project] of resolution.spelling) {
            if (local !== project) {
              translations[project] = translations[local];
              delete translations[local];
            }
          }
        }

        // Counted after the locale check: skipped locales and empty files do
        // not make a push.
        const values = Object.values(translations).reduce(
          (sum, namespaces) =>
            sum + Object.values(namespaces).reduce((n, keys) => n + Object.keys(keys).length, 0),
          0,
        );
        if (values === 0) {
          if (!options.allowEmpty) {
            throw new TypegenError(
              `No translation values to push under ${options.path || config.translationsPath || DEFAULT_TRANSLATIONS_PATH} ` +
                `matching "${fileTemplate}". Check translationsPath and the filters, ` +
                "or pass --allow-empty when an empty push is expected.",
              ErrorCodes.VALIDATION_FAILED,
            );
          }
          console.log("⚠  No translation values to push (--allow-empty)");
          process.exit(0);
        }

        if (options.dryRun) {
          console.log("\n📦 Push preview (dry run):");

          const remoteTranslations = await apiClient.fetchTranslations({
            locales,
            namespaces,
          });

          const diff = sync.compareTranslations(
            localTranslations.translations,
            remoteTranslations.translations,
          );

          console.log(`  ✅ New values: ${diff.created}`);
          console.log(`  ⚠️  Changed values: ${diff.conflicts} (they conflict with the platform)`);

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
            locales,
            namespaces,
          });
          preloadedRemote = remoteTranslations;
          const diff = sync.compareTranslations(
            localTranslations.translations,
            remoteTranslations.translations,
          );

          apiForceMode = await promptConflictResolution(diff.conflicts);
        }

        console.log("🔄 Pushing translations to TMS...");

        const result = await apiClient.pushTranslations({
          translations: localTranslations.translations,
          forceMode: apiForceMode,
          preloadedRemote,
        });

        console.log(`\n✓ Push complete!`);
        console.log(`  Keys created: ${result.created}`);
        if (result.detailed) {
          console.log(
            `  Values: ${result.valuesCreated ?? 0} new, ${result.updated} changed, ` +
              `${result.skipped} kept on the platform`,
          );
        }
        const skippedLocales = result.skippedLocales ?? [];
        if (skippedLocales.length > 0) {
          console.error(
            `⚠  Not imported: ${skippedLocales.join(", ")} — ` +
              "not a project locale, or this API key may not write it.",
          );
        }

        process.exit(0);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Push failed: ${error.message}`);
        }
        process.exit(exitCodeFor(error));
      }
    });
}

async function promptConflictResolution(conflictCount: number): Promise<ApiPushForceMode> {
  // No conflict to resolve, so none may be overwritten: committed with `fail`,
  // a value saved on the platform since the preview stops the push.
  if (conflictCount === 0) {
    return "abort";
  }

  if (!process.stdin.isTTY) {
    throw new TypegenError(
      "--force-mode ask requires an interactive terminal. Use --force-mode override, keep, or abort.",
      ErrorCodes.VALIDATION_FAILED,
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
