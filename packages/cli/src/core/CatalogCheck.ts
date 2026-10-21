import { scanMessageShape, type MessageShape } from "@comvi/typegen";
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
   * selector the locale does not have, or an `=` selector that is not `=`
   * followed by a decimal number (`=1`, `=-1`, `=1.5`), the only exact
   * selector core compiles. `missing-category` (warning): a category the
   * locale has and the message does not write.
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

export interface CatalogCheckUnbalancedTagsFinding {
  key: string;
  tags: string[];
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
  /** Warning: tag markup core renders as literal text. */
  unbalancedTags: CatalogCheckUnbalancedTagsFinding[];
  /** Error: an argument type `@comvi/core` does not compile. */
  unsupportedIcu: CatalogCheckUnsupportedIcuFinding[];
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
  /** Warning: tag markup core renders as literal text. */
  unbalancedTags: CatalogCheckUnbalancedTagsFinding[];
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
  unbalancedTags: number;
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

/** The exact selector core compiles (`compile-icu.ts`): `=` and a decimal number. */
const EXACT_SELECTOR = /^=-?\d+(\.\d+)?$/;

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
        if (Intl.PluralRules.supportedLocalesOf(locale).length > 0) {
          categories = new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories;
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
 * read with the scanner `@comvi/vite-plugin` generates types from, so `check`
 * and the generated types agree about every message.
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
      unbalancedTags: [],
      unsupportedIcu: [],
    };
    const sourceShapes = new Map<string, MessageShape>();
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
        const shape = scanMessageShape(catalog[key]);
        sourceShapes.set(`${namespace}\u0000${key}`, shape);
        if (shape.unsupported !== undefined) {
          sourceReport.unsupportedIcu.push({ key: id, argumentType: shape.unsupported });
        }
        if (shape.unbalancedTags.length > 0) {
          sourceReport.unbalancedTags.push({ key: id, tags: shape.unbalancedTags });
        }
      }
    }

    const summary: CatalogCheckSummary = {
      missing: 0,
      stale: 0,
      emptySource: sourceReport.emptySource.length,
      params: 0,
      plural: 0,
      select: 0,
      tags: 0,
      unbalancedTags: sourceReport.unbalancedTags.length,
      unsupportedIcu: sourceReport.unsupportedIcu.length,
      identical: 0,
    };
    let errors = sourceReport.emptySource.length + sourceReport.unsupportedIcu.length;
    let warnings = sourceReport.unbalancedTags.length;

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
        unbalancedTags: [],
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

          compareMessages(id, sourceShape, scanMessageShape(targetValue!), target, report, {
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
        report.unsupportedIcu.length;
      warnings += report.stale.length + report.unbalancedTags.length + report.identical.length;

      summary.missing += report.missing.length;
      summary.stale += report.stale.length;
      summary.params += report.params.length;
      summary.plural += report.plural.length;
      summary.select += report.select.length;
      summary.tags += report.tags.length;
      summary.unbalancedTags += report.unbalancedTags.length;
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
  source: MessageShape,
  target: MessageShape,
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
  if (target.unbalancedTags.length > 0) {
    report.unbalancedTags.push({ key, tags: target.unbalancedTags });
  }

  // An unsupported argument leaves the scan without that group's parameters,
  // so comparing what is left would report a difference nobody wrote.
  if (source.unsupported !== undefined || target.unsupported !== undefined) return;

  const sourceParams = sorted(source.params.map((param) => param.name));
  const targetParams = sorted(target.params.map((param) => param.name));
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

  for (const { argument, type, selectors } of pluralArguments(target)) {
    if (!selectors.includes("other")) {
      report.plural.push({ key, argument, problem: "missing-other", categories: ["other"] });
    }
    // In a locale `Intl` does not know, only what holds in every locale is
    // judged: `other`, and exact selectors in core's grammar.
    const categories = report.localeUnknown ? undefined : context.pluralCategories(locale, type);
    const invalid = sorted(
      selectors.filter((selector) =>
        selector.startsWith("=")
          ? !EXACT_SELECTOR.test(selector)
          : categories !== undefined && !categories.includes(selector),
      ),
    );
    if (invalid.length > 0) {
      report.plural.push({ key, argument, problem: "invalid-selector", categories: invalid });
    }
    if (categories === undefined) continue;

    const absent = sorted(
      categories.filter((category) => category !== "other" && !selectors.includes(category)),
    );
    if (absent.length > 0) {
      report.plural.push({ key, argument, problem: "missing-category", categories: absent });
    }
  }
}

/**
 * Every `plural` and `selectordinal` argument of a message with the plural
 * rules its selectors are judged against. The one place that reads the
 * scanner's plural fields.
 */
function pluralArguments(
  shape: MessageShape,
): { argument: string; type: PluralRuleType; selectors: string[] }[] {
  const of = (map: Record<string, string[]>, type: PluralRuleType) =>
    Object.keys(map).map((argument) => ({ argument, type, selectors: map[argument] }));
  return [...of(shape.plurals, "cardinal"), ...of(shape.ordinals, "ordinal")].sort((a, b) =>
    a.argument.localeCompare(b.argument),
  );
}
