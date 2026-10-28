import path from "node:path";
import { Command } from "commander";
import { PlatformSource, serializeWireSchema, writeIfChanged } from "@comvi/typegen";
import { ConfigLoader } from "../core/ConfigLoader";
import { platformSource, toCliError } from "../core/typegen";
import { timeoutsFromEnv } from "../core/timeouts";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync, type PullFileDiff } from "../core/TranslationSync";
import {
  DEFAULT_FILE_TEMPLATE,
  DEFAULT_TRANSLATIONS_PATH,
  SCHEMA_FILE,
  isDefaultFileTemplate,
} from "../defaults";
import type { ComviConfig } from "../types";
import { ErrorCodes, exitCodeFor, isTypegenError } from "../utils/errors";
import { findLocale } from "../utils/locales";
import {
  assertAllReturned,
  assertReadable,
  parseListFlag,
  resolveFilter,
} from "../utils/filterResolution";

export function createPullCommand(): Command {
  return new Command("pull")
    .description("Download translations from TMS to local files")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-l, --locale <locales>", "Filter by locales (comma-separated)")
    .option("-n, --ns <namespaces>", "Filter by namespaces (comma-separated)")
    .option("-p, --path <path>", "Override translations output path")
    .option("--empty-dir", "Clear directory before pull")
    .option("--dry-run", "Show what would be written without touching files")
    .option("--no-schema", `Do not write the typegen schema (${SCHEMA_FILE})`)
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
        // Locales are judged by the data that came back, not by `locales`: a
        // key restricted to some languages gets no rows for the others, and an
        // older platform still lists every project locale for it.
        const returnedLocales = Object.keys(translations.translations);
        assertReadable(locs.value, translations.locales, returnedLocales);
        assertAllReturned(
          "locales",
          locs.value,
          translations.namespaces.length > 0 ? returnedLocales : translations.locales,
        );
        assertAllReturned("namespaces", nss.value, translations.namespaces);

        // The whole project's typegen schema v2, read before anything is written: a pull
        // that cannot finish writes nothing. `comvi typegen --from .comvi/schema.json`
        // generates the same declaration from it as from the platform, offline.
        const schema = options.schema === false ? undefined : await fetchSchema(config);

        const defaultNamespace = isDefaultFileTemplate(fileTemplate)
          ? await apiClient.fetchDefaultNamespace()
          : undefined;

        // Judge every name and every resolved path before the clear: the clear
        // runs first, so a name the CLI refuses mid-write would delete the
        // catalog and restore only part of it.
        await sync.assertWritable(translations, { defaultNamespace });

        // The clear runs only once the fetch has returned everything that was
        // asked for, and only over the locales that came back and the
        // namespaces being pulled: a failed request, a missing namespace, or a
        // locale this key cannot read must leave those files as they were.
        const emptyDir = Boolean(options.emptyDir || config.pull?.emptyDir);
        const scope = {
          // Only locales that came back, in their returned spelling:
          // `--locale pt_br` clears pt-BR files, never a locale it did not get.
          locales: (locs.value ?? returnedLocales)
            .map((locale) => findLocale(locale, returnedLocales))
            .filter((locale): locale is string => locale !== undefined),
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
          const diffs = await sync.diffPull(translations, { defaultNamespace });
          console.log(`\n✓ [dry-run] Would write ${diffs.length} files:`);
          for (const diff of diffs) {
            console.log(`  ${diff.filePath} (${describeFileDiff(diff)})`);
            for (const key of diff.removed.slice(0, LISTED_KEYS)) {
              console.log(`    − ${key}`);
            }
            if (diff.removed.length > LISTED_KEYS) {
              console.log(`    … and ${diff.removed.length - LISTED_KEYS} more`);
            }
          }
          if (schema !== undefined) console.log(`  ${SCHEMA_FILE} (the typegen schema)`);
          process.exit(0);
        }

        const diffs = await sync.diffPull(translations, { defaultNamespace });
        const written = new Set(diffs.map(({ filePath }) => filePath));
        const deleted = emptyDir
          ? (await sync.previewClear(scope)).filter((file) => !written.has(file))
          : [];
        warnAboutLocalLosses(diffs, deleted);

        let result;
        if (emptyDir) {
          // Clear and write as one operation: a write that fails partway
          // restores the catalog as it was before the pull.
          console.log("🗑️  Clearing translations directory...");
          console.log("📝 Writing translation files...");
          result = await sync.replaceTranslations(translations, scope, {
            defaultNamespace,
            sourceLocale: config.sourceLocale,
          });
        } else {
          console.log("📝 Writing translation files...");
          result = await sync.writeTranslations(translations, {
            defaultNamespace,
            sourceLocale: config.sourceLocale,
          });
        }

        if (schema !== undefined) {
          const written = writeIfChanged(path.resolve(SCHEMA_FILE), schema);
          console.log(
            written
              ? `📝 Wrote the typegen schema → ${SCHEMA_FILE}`
              : `✓ The typegen schema is unchanged (${SCHEMA_FILE})`,
          );
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
        process.exit(exitCodeFor(error));
      }
    });
}

/**
 * The project's typegen schema v2, canonically serialized; `undefined` when the key may
 * not read it (scope `schema:read`), which a pull of translations does not need.
 */
async function fetchSchema(config: ComviConfig): Promise<string | undefined> {
  try {
    const source = new PlatformSource(platformSource(config).platform);
    return serializeWireSchema(await source.schema());
  } catch (error) {
    const cliError = toCliError(error);
    if (isTypegenError(cliError) && cliError.details?.status === 403) {
      console.error(
        `⚠  ${SCHEMA_FILE} not written: the API key may not read the schema (scope schema:read)`,
      );
      return undefined;
    }
    if (isTypegenError(cliError, ErrorCodes.API_UNSUPPORTED)) {
      console.error(`⚠  ${SCHEMA_FILE} not written: ${cliError.message}`);
      return undefined;
    }
    throw cliError;
  }
}

const LISTED_KEYS = 10;

function describeFileDiff(diff: PullFileDiff): string {
  switch (diff.status) {
    case "new":
      return `new, ${diff.added.length} ${diff.added.length === 1 ? "key" : "keys"}`;
    case "unreadable":
      return "replaces an unreadable file";
    case "unchanged":
      return "unchanged";
  }
  const counts = [
    diff.added.length > 0 ? `+${diff.added.length}` : "",
    diff.changed.length > 0 ? `~${diff.changed.length}` : "",
    diff.removed.length > 0 ? `−${diff.removed.length}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const nested = diff.nested ? "nested keys written flat" : "";
  return [counts, nested].filter(Boolean).join(", ");
}

/** A pull replaces files wholesale: say what local work it is about to lose. */
function warnAboutLocalLosses(diffs: PullFileDiff[], deleted: string[]): void {
  const dropping = diffs.filter((diff) => diff.removed.length > 0);
  const total = dropping.reduce((sum, diff) => sum + diff.removed.length, 0);
  if (total > 0) {
    const listed: string[] = [];
    let budget = LISTED_KEYS;
    for (const diff of dropping) {
      if (budget === 0) break;
      const keys = diff.removed.slice(0, budget);
      budget -= keys.length;
      listed.push(`${diff.filePath}: ${keys.join(", ")}`);
    }
    const more = total > LISTED_KEYS ? `; … and ${total - LISTED_KEYS} more` : "";
    console.error(
      `⚠  Pull removes ${total} local ${total === 1 ? "key" : "keys"} the platform does not have: ` +
        `${listed.join("; ")}${more}. Run comvi push first to keep them; ` +
        "pull --dry-run shows them per file.",
    );
  }

  const unreadable = diffs.filter((diff) => diff.status === "unreadable");
  if (unreadable.length > 0) {
    console.error(
      `⚠  Pull replaces ${unreadable.length} local ${unreadable.length === 1 ? "file" : "files"} ` +
        `it could not read: ${unreadable.map(({ filePath }) => filePath).join(", ")}`,
    );
  }

  if (deleted.length > 0) {
    console.error(
      `⚠  Pull deletes ${deleted.length} local ${deleted.length === 1 ? "file" : "files"} ` +
        `the platform has no catalog for: ${deleted.join(", ")}`,
    );
  }
}
