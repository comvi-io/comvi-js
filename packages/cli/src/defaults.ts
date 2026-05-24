export const DEFAULT_FILE_TEMPLATE = "{namespace}/{languageTag}.json";
export const DEFAULT_NAMESPACE = "default";

export function isDefaultFileTemplate(fileTemplate: string): boolean {
  return fileTemplate.replace(/\\/g, "/") === DEFAULT_FILE_TEMPLATE;
}
