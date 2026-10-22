import {
  CatalogCheck,
  type CatalogCheckOptions,
  type CatalogCheckReport,
} from "../../src/core/CatalogCheck";

/** Plural categories of a fake two-category locale, so a rule never depends on the Node major. */
export const ONE_OTHER = () => ["one", "other"];

/**
 * One source catalog (`en`) against one target (`de`) in the default
 * namespace; `options` overrides any field.
 */
export function check(
  source: Record<string, string>,
  target: Record<string, string>,
  options: Partial<CatalogCheckOptions> = {},
): CatalogCheckReport {
  return CatalogCheck.run({
    translations: { en: { default: source }, de: { default: target } },
    source: "en",
    targets: ["de"],
    namespaces: ["default"],
    pluralCategories: ONE_OTHER,
    ...options,
  });
}
