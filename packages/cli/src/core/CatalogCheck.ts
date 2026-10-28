import { readMessage } from "@comvi/typegen";
import { DEFAULT_NAMESPACE } from "../defaults";
import { emptyDictionary, hasOwnKey } from "../utils/dictionary";
import type { TranslationData } from "../types";

/** Plural rules of `Intl` type `"cardinal"` (`plural`) or `"ordinal"` (`selectordinal`). */
export type PluralRuleType = "cardinal" | "ordinal";

export interface CatalogCheckOptions {
  /** Locale → namespace → key → message, as `TranslationSync.readTranslations` returns it. */
  translations: TranslationData;
  /** The locale every other catalog is compared against. */
  source: string;
  /** The locales to report on. Listed twice counts once; the source is never one of them. */
  targets: string[];
  /** The namespaces to compare. Listed twice counts once. */
  namespaces: string[];
  /** Report a target message equal to its source message (warning). */
  identical?: boolean;
  /** Fail on warnings too. */
  strict?: boolean;
  /**
   * The plural categories `locale` has, or `undefined` when the locale is
   * unknown. Defaults to `Intl.PluralRules` of the running Node.
   */
  pluralCategories?: (locale: string, type: PluralRuleType) => string[] | undefined;
}

export interface CatalogCheckParamsFinding {
  key: string;
  source: string[];
  target: string[];
}

export interface CatalogCheckPluralFinding {
  key: string;
  argument: string;
  /**
   * `missing-other` (error): no `other` branch. `invalid-selector` (error): a
   * selector the locale does not have. `missing-category` (warning): a
   * category the locale has and the message does not write. Each plural of an
   * argument written twice is judged on its own. An exact selector core does
   * not compile (`=x`, `=1e3`) is an `unsupportedIcu` finding instead.
   */
  problem: "missing-other" | "invalid-selector" | "missing-category";
  categories: string[];
}

export interface CatalogCheckSelectFinding {
  key: string;
  argument: string;
  source: string[];
  target: string[];
}

export interface CatalogCheckTagsFinding {
  key: string;
  source: string[];
  target: string[];
}

export interface CatalogCheckSyntaxFinding {
  key: string;
  /** Why `@comvi/core` cannot compile the message (it renders the key instead). */
  message: string;
}

export interface CatalogCheckUnsupportedIcuFinding {
  key: string;
  argumentType: string;
}

/** What is wrong with the source catalog itself, reported once. */
export interface CatalogCheckSourceReport {
  locale: string;
  /** Error: the source message is empty or blank. */
  emptySource: string[];
  /** The source's own plural groups, judged against the source locale's rules. */
  plural: CatalogCheckPluralFinding[];
  /**
   * Error: a message `@comvi/core` cannot compile — an unclosed tag or `{`, a closing tag
   * that closes nothing, a select without `other` — so it renders the key.
   */
  syntax: CatalogCheckSyntaxFinding[];
  /** Error: an argument type `@comvi/core` does not compile. */
  unsupportedIcu: CatalogCheckUnsupportedIcuFinding[];
  /** `Intl` does not know the source locale: only `other` was checked. */
  localeUnknown: boolean;
}

export interface CatalogCheckLocaleReport {
  /**
   * Error: a source key absent or empty in the target. A whitespace-only value
   * counts too — stricter than core, which renders it, blank.
   */
  missing: string[];
  /** Warning: a target key the source does not have. */
  stale: string[];
  /** Error: the parameter names differ. */
  params: CatalogCheckParamsFinding[];
  plural: CatalogCheckPluralFinding[];
  /** Error: the select selectors differ. */
  select: CatalogCheckSelectFinding[];
  /** Error: the source uses tags and the target's tag names differ. */
  tags: CatalogCheckTagsFinding[];
  /** Error: a message `@comvi/core` cannot compile, so it renders the key. */
  syntax: CatalogCheckSyntaxFinding[];
  /** Error: an argument type `@comvi/core` does not compile. */
  unsupportedIcu: CatalogCheckUnsupportedIcuFinding[];
  /** Warning (opt-in): the target message equals the source message. */
  identical: string[];
  /** `Intl` does not know the locale: only `other` and exact selectors were checked. */
  localeUnknown: boolean;
}

/** Findings per rule across the source and every target. */
export interface CatalogCheckSummary {
  missing: number;
  stale: number;
  emptySource: number;
  params: number;
  plural: number;
  select: number;
  tags: number;
  syntax: number;
  unsupportedIcu: number;
  identical: number;
}

export interface CatalogCheckReport {
  source: CatalogCheckSourceReport;
  /** Source keys across the compared namespaces. */
  keys: number;
  locales: Record<string, CatalogCheckLocaleReport>;
  summary: CatalogCheckSummary;
  errors: number;
  warnings: number;
  ok: boolean;
}

/** One message as `@comvi/core` reads it, in the terms the rules compare. */
interface Shape {
  params: string[];
  tags: string[];
  /** `select` argument → its selectors, merged over every use of the name. */
  selects: Record<string, string[]>;
  /** Every plural and selectordinal argument as written, one entry per use. */
  plurals: { argument: string; type: PluralRuleType; selectors: string[] }[];
  /** The argument type core refuses. */
  unsupported?: string;
  /** Any other reason core refuses the message (a plural without `other` is a plural finding). */
  syntax?: string;
  /** Core stops reading at a refusal: what follows it is unknown, so nothing is compared. */
  broken: boolean;
}

/**
 * Reads `text` with `@comvi/core`'s own scanner (through `@comvi/typegen`'s reader), the
 * grammar that renders it and that the generated types come from.
 */
function shapeOf(text: string): Shape {
  const read = readMessage(text);
  const selects = emptyDictionary<string[]>();
  const plurals: Shape["plurals"] = [];
  for (const choice of read.choices) {
    if (choice.kind === "select") {
      const merged = (selects[choice.name] ??= []);
      for (const selector of choice.selectors)
        if (!merged.includes(selector)) merged.push(selector);
    } else {
      plurals.push({
        argument: choice.name,
        type: choice.kind === "selectordinal" ? "ordinal" : "cardinal",
        selectors: choice.selectors,
      });
    }
  }
  const shape: Shape = {
    params: read.params.map((param) => param.name),
    tags: [...read.tags].sort(),
    selects,
    plurals: plurals.sort((a, b) => a.argument.localeCompare(b.argument)),
    broken: read.error !== undefined,
  };
  if (read.unsupported !== undefined) shape.unsupported = read.unsupported;
  else if (read.error !== undefined) {
    // A plural or selectordinal without `other` is reported by the plural rule.
    const pluralWithoutOther = plurals.some((p) => !p.selectors.includes("other"));
    if (!(pluralWithoutOther && /needs an `other` branch$/.test(read.error)))
      shape.syntax = read.error;
  }
  return shape;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * `Intl.PluralRules` of the running Node. A locale `Intl` does not support is
 * `undefined`, where `@comvi/core` would silently fall back to the default
 * rules.
 */
function intlPluralCategories(): (locale: string, type: PluralRuleType) => string[] | undefined {
  const cache = new Map<string, string[] | undefined>();
  return (locale, type) => {
    const id = `${locale}\u0000${type}`;
    if (!cache.has(id)) {
      let categories: string[] | undefined;
      try {
        // `pt_BR.json` is pt-BR: BCP 47 separates subtags with `-` only.
        const tag = locale.replace(/_/g, "-");
        if (Intl.PluralRules.supportedLocalesOf(tag).length > 0) {
          categories = new Intl.PluralRules(tag, { type }).resolvedOptions().pluralCategories;
        }
      } catch {
        // A tag `Intl` cannot parse is a locale it does not know.
      }
      cache.set(id, categories);
    }
    return cache.get(id);
  };
}

/**
 * Offline validation of local catalogs against the source locale: what is
 * missing, stale or empty, and whether each translation asks for the same
 * parameters, plural and select branches and tags as its source. Messages are
 * read with `@comvi/core`'s own scanner, the one the generated types come from,
 * so `check`, the types and the rendered message agree about every message.
 */
export class CatalogCheck {
  static run(options: CatalogCheckOptions): CatalogCheckReport {
    const { translations, source, identical = false, strict = false } = options;
    const pluralCategories = options.pluralCategories ?? intlPluralCategories();
    const namespaces = sorted(options.namespaces);
    const targets = sorted(options.targets).filter((target) => target !== source);

    const label = (namespace: string, key: string) =>
      namespace === DEFAULT_NAMESPACE ? key : `${namespace}:${key}`;
    const sourceCatalog = (namespace: string) => translations[source]?.[namespace] ?? {};

    // The source pass: each source message is scanned once, and what is wrong
    // with the source itself is reported once, with or without targets.
    const sourceReport: CatalogCheckSourceReport = {
      locale: source,
      emptySource: [],
      plural: [],
      syntax: [],
      unsupportedIcu: [],
      localeUnknown: pluralCategories(source, "cardinal") === undefined,
    };
    const sourceShapes = new Map<string, Shape>();
    let keys = 0;
    for (const namespace of namespaces) {
      const catalog = sourceCatalog(namespace);
      for (const key of Object.keys(catalog).sort()) {
        keys++;
        const id = label(namespace, key);
        if (isBlank(catalog[key])) {
          sourceReport.emptySource.push(id);
          continue;
        }
        const shape = shapeOf(catalog[key]);
        sourceShapes.set(`${namespace}\u0000${key}`, shape);
        if (shape.unsupported !== undefined) {
          sourceReport.unsupportedIcu.push({ key: id, argumentType: shape.unsupported });
        } else {
          sourceReport.plural.push(
            ...judgePlurals(id, shape, source, sourceReport.localeUnknown, pluralCategories),
          );
        }
        if (shape.syntax !== undefined) {
          sourceReport.syntax.push({ key: id, message: shape.syntax });
        }
      }
    }

    const summary: CatalogCheckSummary = {
      missing: 0,
      stale: 0,
      emptySource: sourceReport.emptySource.length,
      params: 0,
      plural: sourceReport.plural.length,
      select: 0,
      tags: 0,
      syntax: sourceReport.syntax.length,
      unsupportedIcu: sourceReport.unsupportedIcu.length,
      identical: 0,
    };
    let errors =
      sourceReport.emptySource.length +
      sourceReport.unsupportedIcu.length +
      sourceReport.syntax.length;
    let warnings = 0;
    for (const plural of sourceReport.plural) {
      if (plural.problem === "missing-category") warnings++;
      else errors++;
    }

    // Null prototype: a locale file named `__proto__.json` is an entry.
    const locales = emptyDictionary<CatalogCheckLocaleReport>();
    for (const target of targets) {
      const report: CatalogCheckLocaleReport = {
        missing: [],
        stale: [],
        params: [],
        plural: [],
        select: [],
        tags: [],
        syntax: [],
        unsupportedIcu: [],
        identical: [],
        localeUnknown: pluralCategories(target, "cardinal") === undefined,
      };

      for (const namespace of namespaces) {
        const sourceMessages = sourceCatalog(namespace);
        const targetMessages = translations[target]?.[namespace] ?? {};

        for (const key of Object.keys(targetMessages).sort()) {
          if (!hasOwnKey(sourceMessages, key)) report.stale.push(label(namespace, key));
        }

        for (const key of Object.keys(sourceMessages).sort()) {
          const sourceShape = sourceShapes.get(`${namespace}\u0000${key}`);
          // An empty source message is a source finding, not one per target.
          if (!sourceShape) continue;

          const id = label(namespace, key);
          const targetValue = hasOwnKey(targetMessages, key) ? targetMessages[key] : undefined;
          if (isBlank(targetValue)) {
            report.missing.push(id);
            continue;
          }

          compareMessages(id, sourceShape, shapeOf(targetValue!), target, report, {
            pluralCategories,
          });

          if (identical && targetValue === sourceMessages[key]) report.identical.push(id);
        }
      }

      for (const plural of report.plural) {
        if (plural.problem === "missing-category") warnings++;
        else errors++;
      }
      errors +=
        report.missing.length +
        report.params.length +
        report.select.length +
        report.tags.length +
        report.syntax.length +
        report.unsupportedIcu.length;
      warnings += report.stale.length + report.identical.length;

      summary.missing += report.missing.length;
      summary.stale += report.stale.length;
      summary.params += report.params.length;
      summary.plural += report.plural.length;
      summary.select += report.select.length;
      summary.tags += report.tags.length;
      summary.syntax += report.syntax.length;
      summary.unsupportedIcu += report.unsupportedIcu.length;
      summary.identical += report.identical.length;
      locales[target] = report;
    }

    return {
      source: sourceReport,
      keys,
      locales,
      summary,
      errors,
      warnings,
      ok: errors === 0 && (!strict || warnings === 0),
    };
  }
}

function compareMessages(
  key: string,
  source: Shape,
  target: Shape,
  locale: string,
  report: CatalogCheckLocaleReport,
  context: { pluralCategories: NonNullable<CatalogCheckOptions["pluralCategories"]> },
): void {
  if (target.unsupported !== undefined) {
    report.unsupportedIcu.push({ key, argumentType: target.unsupported });
  }

  if (source.tags.length > 0 && !sameSet(source.tags, target.tags)) {
    report.tags.push({ key, source: source.tags, target: target.tags });
  }
  if (target.syntax !== undefined) {
    report.syntax.push({ key, message: target.syntax });
  }

  // Core stops reading at what it refuses, so the rest of that message is unknown:
  // comparing what is left would report a difference nobody wrote. The target's plurals
  // are still judged (a plural without `other` is how a target breaks most often),
  // unless either side uses an argument type core does not implement.
  if (source.broken || target.broken) {
    if (source.unsupported === undefined && target.unsupported === undefined)
      report.plural.push(
        ...judgePlurals(key, target, locale, report.localeUnknown, context.pluralCategories),
      );
    return;
  }

  const sourceParams = sorted(source.params);
  const targetParams = sorted(target.params);
  if (!sameSet(sourceParams, targetParams)) {
    report.params.push({ key, source: sourceParams, target: targetParams });
  }

  for (const argument of sorted([...Object.keys(source.selects), ...Object.keys(target.selects)])) {
    const sourceSelectors = sorted(source.selects[argument] ?? []);
    const targetSelectors = sorted(target.selects[argument] ?? []);
    if (!sameSet(sourceSelectors, targetSelectors)) {
      report.select.push({ key, argument, source: sourceSelectors, target: targetSelectors });
    }
  }

  report.plural.push(
    ...judgePlurals(key, target, locale, report.localeUnknown, context.pluralCategories),
  );
}

/**
 * Each plural and selectordinal group of one message against `locale`'s
 * rules: `other` everywhere, categories only where `Intl` knows the locale.
 */
function judgePlurals(
  key: string,
  shape: Shape,
  locale: string,
  localeUnknown: boolean,
  pluralCategories: NonNullable<CatalogCheckOptions["pluralCategories"]>,
): CatalogCheckPluralFinding[] {
  const findings: CatalogCheckPluralFinding[] = [];
  for (const { argument, type, selectors } of shape.plurals) {
    if (!selectors.includes("other")) {
      findings.push({ key, argument, problem: "missing-other", categories: ["other"] });
    }
    // In a locale `Intl` does not know, only `other` is judged. An `=`
    // selector here is always one core compiles: the scanner reports any other
    // as an unsupported argument, and callers skip such a message.
    const categories = localeUnknown ? undefined : pluralCategories(locale, type);
    if (categories === undefined) continue;

    const invalid = sorted(
      selectors.filter((selector) => !selector.startsWith("=") && !categories.includes(selector)),
    );
    if (invalid.length > 0) {
      findings.push({ key, argument, problem: "invalid-selector", categories: invalid });
    }

    const absent = sorted(
      categories.filter((category) => category !== "other" && !selectors.includes(category)),
    );
    if (absent.length > 0) {
      findings.push({ key, argument, problem: "missing-category", categories: absent });
    }
  }
  return findings;
}
