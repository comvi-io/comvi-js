import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { TranslationSync, type LocalTranslations } from "../core/TranslationSync";
import {
  CatalogCheck,
  type CatalogCheckReport,
  type CatalogCheckSummary,
} from "../core/CatalogCheck";
import { DEFAULT_FILE_TEMPLATE, DEFAULT_TRANSLATIONS_PATH, isValidFileTemplate } from "../defaults";
import type { ComviConfig } from "../types";
import {
  ErrorCodes,
  EXIT_FAILURE,
  EXIT_VALIDATION,
  exitCodeFor,
  TypegenError,
} from "../utils/errors";
import { assertAllReturned, parseListFlag, resolveFilter } from "../utils/filterResolution";
import { localeKey } from "../utils/locales";

/** The locale `check` compares against when neither `--source` nor `sourceLocale` names one. */
const FALLBACK_SOURCE = "en";

interface CheckCommandOptions {
  config?: string;
  path?: string;
  fileTemplate?: string;
  source?: string;
  locale?: string;
  ns?: string;
  format?: string;
  identical?: boolean;
  fail: boolean;
  strict?: boolean;
}

/** Input `check` refuses to act on: exit 4, like every command's invalid input. */
const inputError = (message: string) => new TypegenError(message, ErrorCodes.VALIDATION_FAILED);

export function createCheckCommand(): Command {
  return new Command("check")
    .description("Validate local translation catalogs against the source locale (offline)")
    .option("-c, --config <path>", "Path to .comvirc.json file (optional for check)")
    .option("-p, --path <path>", "Translations directory")
    .option("--file-template <template>", "File template, e.g. {languageTag}.json")
    .option("-s, --source <locale>", "Source locale (default: sourceLocale, else en)")
    .option("-l, --locale <locales>", "Check only these locales (comma-separated)")
    .option("-n, --ns <namespaces>", "Check only these namespaces (comma-separated)")
    .option("--format <format>", "Output format: text or json", "text")
    .option("--identical", "Warn when a translation equals its source")
    .option("--no-fail", "Exit 0 even when there are findings")
    .option("--strict", "Fail on warnings too")
    .action(async (options: CheckCommandOptions) => {
      process.exit(await runCheck(options));
    });
}

async function runCheck(options: CheckCommandOptions): Promise<number> {
  let config: ComviConfig;
  try {
    config = await ConfigLoader.load(options.config, { requireApiKey: false, optional: true });
  } catch (error) {
    return fail(error, readFailureCode(error));
  }

  let settings: ReturnType<typeof resolveSettings>;
  try {
    settings = resolveSettings(options, config);
  } catch (error) {
    return fail(error, exitCodeFor(error));
  }

  const { translationsPath, fileTemplate, format, targets, namespaces } = settings;
  const sync = new TranslationSync({ translationsPath, fileTemplate, format: "json" });
  const sourceName = settings.source ?? FALLBACK_SOURCE;

  process.stderr.write(`Reading ${translationsPath}…\n`);
  let local: LocalTranslations;
  try {
    local = await sync.readTranslations({
      locales: targets ? [sourceName, ...targets] : undefined,
      namespaces,
    });
  } catch (error) {
    return fail(error, readFailureCode(error));
  }

  // Requested names are matched to the catalogs' own: `-l pt-BR` checks
  // `pt-br.json` and reports it as `pt-br`.
  const catalogsFor = (name: string) =>
    local.locales.filter((locale) => localeKey(locale) === localeKey(name));
  let source: string;
  try {
    // A filter typo first: it also hides the source catalog.
    assertAllReturned("namespaces", namespaces, local.namespaces);
    const unknown = (targets ?? []).filter((name) => catalogsFor(name).length === 0);
    if (unknown.length > 0) {
      // Only the requested locales were read, so the others cannot be listed.
      throw inputError(
        `Unknown locales: ${unknown.join(", ")}: no catalog for them in ${translationsPath}.`,
      );
    }
    const sources = catalogsFor(sourceName);
    if (sources.length === 0) {
      throw inputError(
        settings.source === undefined
          ? `no catalog for "${FALLBACK_SOURCE}" in ${translationsPath}: name the source locale with --source or "sourceLocale" in .comvirc.json`
          : `no catalog for the source locale "${sourceName}" in ${translationsPath}`,
      );
    }
    if (sources.length > 1) {
      throw inputError(
        `the source locale "${sourceName}" matches more than one catalog: ${sources.join(", ")}`,
      );
    }
    source = sources[0];
  } catch (error) {
    return fail(error, exitCodeFor(error));
  }

  let report: CatalogCheckReport;
  try {
    report = CatalogCheck.run({
      translations: local.translations,
      source,
      targets: targets ? targets.flatMap(catalogsFor) : local.locales,
      namespaces: local.namespaces,
      identical: options.identical ?? config.check?.identical ?? false,
      strict: options.strict ?? config.check?.strict ?? false,
    });
  } catch (error) {
    // A bug, not the user's input: the scheme's local failure (1).
    return fail(error, exitCodeFor(error));
  }

  // Findings are the scheme's "ran and found a problem" (1), as for
  // `typegen --check`. check never talks to the platform: never 2 or 3.
  const code = report.ok || !options.fail ? 0 : EXIT_FAILURE;
  console.log(
    format === "json"
      ? JSON.stringify(
          {
            version: 1,
            source: report.source,
            translationsPath,
            fileTemplate,
            keys: report.keys,
            locales: report.locales,
            summary: report.summary,
            errors: report.errors,
            warnings: report.warnings,
            ok: report.ok,
          },
          null,
          2,
        )
      : formatText(report, translationsPath, code, options.fail),
  );
  return code;
}

function resolveSettings(options: CheckCommandOptions, config: ComviConfig) {
  if (options.format !== "text" && options.format !== "json") {
    throw inputError(`--format must be "text" or "json", received "${options.format}"`);
  }

  const fileTemplate = options.fileTemplate ?? config.fileTemplate ?? DEFAULT_FILE_TEMPLATE;
  if (!isValidFileTemplate(fileTemplate, true)) {
    throw inputError(
      `--file-template must contain one {languageTag}, at most one {namespace} and end in ".json", received "${fileTemplate}"`,
    );
  }

  // The shared flag rule: an empty value is a usage error, not "everything".
  parseListFlag(options.source, "--source");

  return {
    translationsPath: options.path ?? config.translationsPath ?? DEFAULT_TRANSLATIONS_PATH,
    fileTemplate,
    format: options.format,
    // Matched with the shared locale key, which also trims: `-s " de "` is de.
    source: options.source ?? config.sourceLocale,
    // The source may be listed too; it is read, and never reported on.
    targets: resolveFilter(parseListFlag(options.locale, "--locale"), config.locales).value,
    namespaces: resolveFilter(parseListFlag(options.ns, "--ns"), config.namespaces).value,
  };
}

/**
 * Reading the config or the catalogs failed. A raw file-system error — a
 * `--config` or `--path` naming the wrong kind of entry (EISDIR, ENOTDIR), one
 * that may not be read (EACCES, EPERM), EIO — is an unreadable local file:
 * invalid input (4), like the reader's own FS_READ_FAILED. Anything else goes
 * through the shared mapping.
 */
function readFailureCode(error: unknown): number {
  const errno = (error as NodeJS.ErrnoException | undefined)?.code;
  if (!(error instanceof TypegenError) && typeof errno === "string") return EXIT_VALIDATION;
  return exitCodeFor(error);
}

function fail(error: unknown, code: number): number {
  console.error(`✗ Check failed: ${error instanceof Error ? error.message : String(error)}`);
  return code;
}

type Rule = keyof CatalogCheckSummary;

const RULE_LABELS: Record<Rule, string> = {
  missing: "missing",
  stale: "stale",
  emptySource: "empty source",
  params: "params",
  plural: "plural",
  select: "select",
  tags: "tags",
  unbalancedTags: "unbalanced tags",
  unsupportedIcu: "unsupported ICU",
  identical: "identical",
};

function counts(countOf: (rule: Rule) => number): string {
  return (Object.keys(RULE_LABELS) as Rule[])
    .filter((rule) => countOf(rule) > 0)
    .map((rule) => `${countOf(rule)} ${RULE_LABELS[rule]}`)
    .join(", ");
}

const list = (values: string[]) => `{${values.join(", ")}}`;

function formatText(
  report: CatalogCheckReport,
  translationsPath: string,
  code: number,
  failOnFindings: boolean,
): string {
  const { source } = report;
  const targets = Object.keys(report.locales);
  const width = Math.max(source.locale.length, ...targets.map((locale) => locale.length)) + 2;
  const sourceCounts = counts((rule) =>
    rule === "emptySource" ||
    rule === "plural" ||
    rule === "unbalancedTags" ||
    rule === "unsupportedIcu"
      ? source[rule].length
      : 0,
  );
  const sourceUnknown = source.localeUnknown ? " (no Intl plural rules: only `other` checked)" : "";
  const lines = [
    `comvi check  ${translationsPath}  source=${source.locale}  ${targets.length + 1} locales  ${report.keys} keys`,
    `${source.locale.padEnd(width)}source: ${sourceCounts || "ok"}${sourceUnknown}`,
  ];
  const details: string[] = [];

  for (const key of source.emptySource) details.push(`empty source  ${source.locale}:${key}`);
  for (const f of source.plural) {
    details.push(
      `plural  ${source.locale}:${f.key}  {${f.argument}} ${f.problem} ${f.categories.join(", ")}`,
    );
  }
  for (const f of source.unbalancedTags) {
    details.push(`unbalanced tags  ${source.locale}:${f.key}  ${list(f.tags)}`);
  }
  for (const f of source.unsupportedIcu) {
    details.push(`unsupported ICU  ${source.locale}:${f.key}  ${f.argumentType}`);
  }

  for (const locale of targets) {
    const entry = report.locales[locale];
    const line = counts((rule) => (rule === "emptySource" ? 0 : entry[rule].length));
    const unknown = entry.localeUnknown ? " (no Intl plural rules: only `other` checked)" : "";
    lines.push(`${locale.padEnd(width)}${line || "ok"}${unknown}`);

    for (const key of entry.missing) details.push(`missing  ${locale}:${key}`);
    for (const key of entry.stale) details.push(`stale  ${locale}:${key}`);
    for (const f of entry.params) {
      details.push(
        `params  ${locale}:${f.key}  source ${list(f.source)}  target ${list(f.target)}`,
      );
    }
    for (const f of entry.plural) {
      details.push(
        `plural  ${locale}:${f.key}  {${f.argument}} ${f.problem} ${f.categories.join(", ")}`,
      );
    }
    for (const f of entry.select) {
      details.push(
        `select  ${locale}:${f.key}  {${f.argument}}  source ${list(f.source)}  target ${list(f.target)}`,
      );
    }
    for (const f of entry.tags) {
      details.push(`tags  ${locale}:${f.key}  source ${list(f.source)}  target ${list(f.target)}`);
    }
    for (const f of entry.unbalancedTags) {
      details.push(`unbalanced tags  ${locale}:${f.key}  ${list(f.tags)}`);
    }
    for (const f of entry.unsupportedIcu) {
      details.push(`unsupported ICU  ${locale}:${f.key}  ${f.argumentType}`);
    }
    for (const key of entry.identical) details.push(`identical  ${locale}:${key}`);
  }

  const total = counts((rule) => report.summary[rule]) || "no findings";
  const suffix = !report.ok && !failOnFindings ? " (--no-fail)" : "";
  return [...lines, ...details, `${report.ok ? "✓" : "✗"} ${total} — exit ${code}${suffix}`].join(
    "\n",
  );
}
