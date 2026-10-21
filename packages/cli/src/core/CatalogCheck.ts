import { scanMessageShape, type MessageShape } from "@comvi/typegen";
import { DEFAULT_NAMESPACE } from "../defaults";
import { hasOwnKey } from "../utils/dictionary";
import type { TranslationData } from "../types";

/** Plural rules of `Intl` type `"cardinal"` (`plural`) or `"ordinal"` (`selectordinal`). */
export type PluralRuleType = "cardinal" | "ordinal";

export interface CheckOptions {
  /** Locale → namespace → key → message, as `TranslationSync.readTranslations` returns it. */
  translations: TranslationData;
  /** The locale every other catalog is compared against. */
  source: string;
  /** The locales to report on; the source is never one of them. */
  targets: string[];
  /** The namespaces to compare. */
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

export interface CheckParamsFinding {
  key: string;
  source: string[];
  target: string[];
}

export interface CheckPluralFinding {
  key: string;
  argument: string;
  /**
   * `missing-other` (error): no `other` branch. `unknown-category` (error): a
   * selector the locale does not have. `missing-category` (warning): a category
   * the locale has and the message does not write.
   */
  problem: "missing-other" | "unknown-category" | "missing-category";
  categories: string[];
}

export interface CheckSelectFinding {
  key: string;
  argument: string;
  source: string[];
  target: string[];
}

export interface CheckTagsFinding {
  key: string;
  source: string[];
  target: string[];
}

export interface CheckUnbalancedTagsFinding {
  key: string;
  side: "source" | "target";
  tags: string[];
}

export interface CheckUnsupportedIcuFinding {
  key: string;
  side: "source" | "target";
  argumentType: string;
}

export interface CheckLocaleReport {
  /** Error: a source key absent, empty or blank in the target. */
  missing: string[];
  /** Warning: a target key the source does not have. */
  stale: string[];
  /** Error: the source message is empty or blank. */
  emptySource: string[];
  /** Error: the parameter names differ. */
  params: CheckParamsFinding[];
  plural: CheckPluralFinding[];
  /** Error: the select selectors differ. */
  select: CheckSelectFinding[];
  /** Error: the source uses tags and the target's tag names differ. */
  tags: CheckTagsFinding[];
  /** Warning: a tag opened without a close or closed without an open. */
  unbalancedTags: CheckUnbalancedTagsFinding[];
  /** Error: an argument type `@comvi/core` does not compile. */
  unsupportedIcu: CheckUnsupportedIcuFinding[];
  /** Warning (opt-in): the target message equals the source message. */
  identical: string[];
  /** `Intl` does not know the locale, so its plural rules were not checked. */
  localeUnknown: boolean;
}

export interface CheckSummary {
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

export interface CheckReport {
  source: string;
  /** Source keys across the compared namespaces. */
  keys: number;
  locales: Record<string, CheckLocaleReport>;
  summary: CheckSummary;
  errors: number;
  warnings: number;
  ok: boolean;
}

/** `=` followed by a number: an ICU exact selector, valid in every locale. */
function isExactSelector(selector: string): boolean {
  return (
    selector.startsWith("=") && selector.length > 1 && !Number.isNaN(Number(selector.slice(1)))
  );
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
        if (Intl.PluralRules.supportedLocalesOf(locale).length > 0) {
          categories = new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories;
        }
      } catch {
        categories = undefined;
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
  static run(options: CheckOptions): CheckReport {
    const { translations, source, namespaces, identical = false, strict = false } = options;
    const pluralCategories = options.pluralCategories ?? intlPluralCategories();
    const sourceShapes = new Map<string, MessageShape>();
    const targets = [...options.targets].sort();

    const label = (namespace: string, key: string) =>
      namespace === DEFAULT_NAMESPACE ? key : `${namespace}:${key}`;

    let keys = 0;
    for (const namespace of namespaces) {
      keys += Object.keys(translations[source]?.[namespace] ?? {}).length;
    }

    const locales: Record<string, CheckLocaleReport> = {};
    const summary: CheckSummary = {
      missing: 0,
      stale: 0,
      emptySource: 0,
      params: 0,
      plural: 0,
      select: 0,
      tags: 0,
      unbalancedTags: 0,
      unsupportedIcu: 0,
      identical: 0,
    };
    let errors = 0;
    let warnings = 0;

    for (const target of targets) {
      const report: CheckLocaleReport = {
        missing: [],
        stale: [],
        emptySource: [],
        params: [],
        plural: [],
        select: [],
        tags: [],
        unbalancedTags: [],
        unsupportedIcu: [],
        identical: [],
        localeUnknown: pluralCategories(target, "cardinal") === undefined,
      };

      for (const namespace of [...namespaces].sort()) {
        const sourceCatalog = translations[source]?.[namespace] ?? {};
        const targetCatalog = translations[target]?.[namespace] ?? {};

        for (const key of Object.keys(targetCatalog).sort()) {
          if (!hasOwnKey(sourceCatalog, key)) report.stale.push(label(namespace, key));
        }

        for (const key of Object.keys(sourceCatalog).sort()) {
          const id = label(namespace, key);
          const sourceValue = sourceCatalog[key];
          const targetValue = hasOwnKey(targetCatalog, key) ? targetCatalog[key] : undefined;

          if (isBlank(sourceValue)) {
            report.emptySource.push(id);
            continue;
          }
          if (isBlank(targetValue)) {
            report.missing.push(id);
            continue;
          }

          const sourceId = `${namespace}\u0000${key}`;
          let sourceShape = sourceShapes.get(sourceId);
          if (!sourceShape) {
            sourceShape = scanMessageShape(sourceValue);
            sourceShapes.set(sourceId, sourceShape);
          }
          compareMessages(id, sourceShape, scanMessageShape(targetValue!), target, report, {
            pluralCategories,
          });

          if (identical && targetValue === sourceValue) report.identical.push(id);
        }
      }

      for (const plural of report.plural) {
        if (plural.problem === "missing-category") warnings++;
        else errors++;
      }
      errors +=
        report.missing.length +
        report.emptySource.length +
        report.params.length +
        report.select.length +
        report.tags.length +
        report.unsupportedIcu.length;
      warnings += report.stale.length + report.unbalancedTags.length + report.identical.length;

      for (const rule of Object.keys(summary) as (keyof CheckSummary)[]) {
        summary[rule] += report[rule].length;
      }
      locales[target] = report;
    }

    return {
      source,
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
  report: CheckLocaleReport,
  context: { pluralCategories: NonNullable<CheckOptions["pluralCategories"]> },
): void {
  if (source.unsupported !== undefined) {
    report.unsupportedIcu.push({ key, side: "source", argumentType: source.unsupported });
  }
  if (target.unsupported !== undefined) {
    report.unsupportedIcu.push({ key, side: "target", argumentType: target.unsupported });
  }

  if (source.tags.length > 0 && !sameSet(source.tags, target.tags)) {
    report.tags.push({ key, source: source.tags, target: target.tags });
  }
  if (source.unbalancedTags.length > 0) {
    report.unbalancedTags.push({ key, side: "source", tags: source.unbalancedTags });
  }
  if (target.unbalancedTags.length > 0) {
    report.unbalancedTags.push({ key, side: "target", tags: target.unbalancedTags });
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

  if (report.localeUnknown) return;

  for (const { argument, type, selectors } of pluralArguments(target)) {
    const categories = context.pluralCategories(locale, type);
    if (categories === undefined) continue;

    if (!selectors.includes("other")) {
      report.plural.push({ key, argument, problem: "missing-other", categories: ["other"] });
    }
    const unknown = sorted(
      selectors.filter((selector) => !categories.includes(selector) && !isExactSelector(selector)),
    );
    if (unknown.length > 0) {
      report.plural.push({ key, argument, problem: "unknown-category", categories: unknown });
    }
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
  return Object.keys(shape.plurals)
    .sort()
    .map((argument) => ({
      argument,
      type: shape.ordinals.includes(argument) ? "ordinal" : "cardinal",
      selectors: shape.plurals[argument],
    }));
}
