export const DEFAULT_FILE_TEMPLATE = "{namespace}/{languageTag}.json";
export const DEFAULT_NAMESPACE = "default";
export const DEFAULT_TRANSLATIONS_PATH = "./src/locales";

export function isDefaultFileTemplate(fileTemplate: string): boolean {
  return fileTemplate.replace(/\\/g, "/") === DEFAULT_FILE_TEMPLATE;
}

/**
 * One `{languageTag}`, one `{namespace}` and a `.json` (or `.{extension}`)
 * ending. A template without `{namespace}` is one catalog per locale, which a
 * reader takes as the default namespace; only `check`, which never writes,
 * accepts it (`namespaceOptional`).
 */
export function isValidFileTemplate(template: string, namespaceOptional: boolean): boolean {
  const count = (placeholder: string) => template.split(placeholder).length - 1;
  const namespaces = count("{namespace}");
  return (
    count("{languageTag}") === 1 &&
    (namespaces === 1 || (namespaceOptional && namespaces === 0)) &&
    (template.endsWith(".json") || template.endsWith(".{extension}"))
  );
}
