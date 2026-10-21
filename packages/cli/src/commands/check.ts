import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { TranslationSync } from "../core/TranslationSync";
import { CatalogCheck, type CheckReport } from "../core/CatalogCheck";
import { DEFAULT_FILE_TEMPLATE } from "../defaults";
import type { ComviConfig } from "../types";
import { ErrorCodes, EXIT_CHECK_FAILED, EXIT_VALIDATION, isTypegenError } from "../utils/errors";
import { assertAllReturned, parseListFlag, resolveFilter } from "../utils/filterResolution";

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

/** Input `check` refuses to act on: exit 4. */
class InputError extends Error {}

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
    return fail(error, EXIT_VALIDATION);
  }

  let settings: ReturnType<typeof resolveSettings>;
  try {
    settings = resolveSettings(options, config);
  } catch (error) {
    return fail(error, EXIT_VALIDATION);
  }

  const { translationsPath, fileTemplate, format, targets, namespaces } = settings;
  const sync = new TranslationSync({ translationsPath, fileTemplate, format: "json" });
  const source = settings.source ?? FALLBACK_SOURCE;

  process.stderr.write(`Reading ${translationsPath}…\n`);
  let local: Awaited<ReturnType<TranslationSync["readTranslations"]>>;
  try {
    local = await sync.readTranslations({
      locales: targets ? [source, ...targets] : undefined,
      namespaces,
    });
  } catch (error) {
    return fail(error, isInputError(error) ? EXIT_VALIDATION : EXIT_CHECK_FAILED);
  }

  let report: CheckReport;
  try {
    // A filter typo first: it also hides the source catalog.
    assertAllReturned("namespaces", namespaces, local.namespaces);
    assertAllReturned("locales", targets, local.locales);
    if (!local.locales.includes(source)) {
      throw new InputError(
        settings.source === undefined
          ? `no catalog for "${FALLBACK_SOURCE}" in ${translationsPath}: name the source locale with --source or "sourceLocale" in .comvirc.json`
          : `no catalog for the source locale "${source}" in ${translationsPath}`,
      );
    }

    report = CatalogCheck.run({
      translations: local.translations,
      source,
      targets: (targets ?? local.locales).filter((locale) => locale !== source),
      namespaces: local.namespaces,
      identical: options.identical ?? config.check?.identical ?? false,
      strict: options.strict ?? config.check?.strict ?? false,
    });
  } catch (error) {
    return fail(error, EXIT_VALIDATION);
  }

  const code = report.ok || !options.fail ? 0 : 1;
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
    throw new InputError(`--format must be "text" or "json", received "${options.format}"`);
  }

  const fileTemplate = options.fileTemplate ?? config.fileTemplate ?? DEFAULT_FILE_TEMPLATE;
  const count = (placeholder: string) => fileTemplate.split(placeholder).length - 1;
  if (
    count("{languageTag}") !== 1 ||
    count("{namespace}") > 1 ||
    !(fileTemplate.endsWith(".json") || fileTemplate.endsWith(".{extension}"))
  ) {
    throw new InputError(
      `--file-template must contain one {languageTag}, at most one {namespace} and end in ".json", received "${fileTemplate}"`,
    );
  }

  for (const [flag, value] of [
    ["--source", options.source],
    ["--locale", options.locale],
    ["--ns", options.ns],
  ] as const) {
    if (value !== undefined && parseListFlag(value) === undefined) {
      throw new InputError(`${flag} must not be empty`);
    }
  }

  const source = options.source?.trim() ?? config.sourceLocale;
  const targets = resolveFilter(parseListFlag(options.locale), config.locales).value?.filter(
    (locale) => locale !== source,
  );

  return {
    translationsPath: options.path ?? config.translationsPath ?? "./src/locales",
    fileTemplate,
    format: options.format,
    source,
    targets,
    namespaces: resolveFilter(parseListFlag(options.ns), config.namespaces).value,
  };
}

/** A catalog file the user wrote is their input, as for pull and push; anything else is I/O. */
function isInputError(error: unknown): boolean {
  if (isTypegenError(error, ErrorCodes.CONFIG_INVALID)) return true;
  if (!isTypegenError(error, ErrorCodes.FS_READ_FAILED)) return false;
  const code = (error.cause as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "EACCES";
}

function fail(error: unknown, code: number): number {
  console.error(`✗ Check failed: ${error instanceof Error ? error.message : String(error)}`);
  return code;
}

const RULE_LABELS: Record<keyof CheckReport["summary"], string> = {
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

function counts(countOf: (rule: keyof CheckReport["summary"]) => number): string {
  return (Object.keys(RULE_LABELS) as (keyof CheckReport["summary"])[])
    .filter((rule) => countOf(rule) > 0)
    .map((rule) => `${countOf(rule)} ${RULE_LABELS[rule]}`)
    .join(", ");
}

const list = (values: string[]) => `{${values.join(", ")}}`;

function formatText(
  report: CheckReport,
  translationsPath: string,
  code: number,
  failOnFindings: boolean,
): string {
  const targets = Object.keys(report.locales);
  const width = Math.max(0, ...targets.map((locale) => locale.length)) + 2;
  const lines = [
    `comvi check  ${translationsPath}  source=${report.source}  ${targets.length + 1} locales  ${report.keys} keys`,
  ];
  const details: string[] = [];

  for (const locale of targets) {
    const entry = report.locales[locale];
    const line = counts((rule) => entry[rule].length);
    const unknown = entry.localeUnknown ? " (plural rules unknown to Intl, not checked)" : "";
    lines.push(`${locale.padEnd(width)}${line || "ok"}${unknown}`);

    for (const key of entry.missing) details.push(`missing  ${locale}:${key}`);
    for (const key of entry.stale) details.push(`stale  ${locale}:${key}`);
    for (const key of entry.emptySource) details.push(`empty source  ${locale}:${key}`);
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
      details.push(`unbalanced tags  ${locale}:${f.key}  ${f.side} ${list(f.tags)}`);
    }
    for (const f of entry.unsupportedIcu) {
      details.push(`unsupported ICU  ${locale}:${f.key}  ${f.side} ${f.argumentType}`);
    }
    for (const key of entry.identical) details.push(`identical  ${locale}:${key}`);
  }

  const total = counts((rule) => report.summary[rule]) || "no findings";
  const suffix = !report.ok && !failOnFindings ? " (--no-fail)" : "";
  return [...lines, ...details, `${report.ok ? "✓" : "✗"} ${total} — exit ${code}${suffix}`].join(
    "\n",
  );
}
