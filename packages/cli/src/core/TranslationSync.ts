/**
 * TranslationSync - Handle local translation file operations
 *
 * Responsibilities:
 * - Write translations to local files (pull)
 * - Read translations from local files (push)
 * - Parse file template patterns
 * - Compare local vs remote translations
 */

import { promises as fs } from "fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
import type {
  TranslationData,
  TranslationsResponse,
  TranslationSyncOptions,
  PullResult,
  TranslationDiff,
} from "../types";
import { TypegenError, ErrorCodes, wrapError } from "../utils/errors";

export interface ReadTranslationsOptions {
  locales?: string[];
  namespaces?: string[];
}

export interface LocalTranslations {
  translations: TranslationData;
  locales: string[];
  namespaces: string[];
}

export class TranslationSync {
  private translationsPath: string;
  private fileTemplate: string;
  private format: "json";

  constructor(options: TranslationSyncOptions) {
    this.translationsPath = resolve(options.translationsPath);
    this.fileTemplate = options.fileTemplate;
    this.format = options.format;
  }

  /**
   * Write translations to local files
   */
  async writeTranslations(data: TranslationsResponse): Promise<PullResult> {
    const { translations, locales, namespaces } = data;
    let filesWritten = 0;

    for (const locale of locales) {
      const localeTranslations = translations[locale];
      if (!localeTranslations) continue;

      for (const ns of namespaces) {
        const nsTranslations = localeTranslations[ns];
        if (!nsTranslations) continue;

        const filePath = this.resolveFilePath(locale, ns);
        await this.ensureDirectory(dirname(filePath));

        const content = JSON.stringify(nsTranslations, null, 2) + "\n";
        await fs.writeFile(filePath, content, "utf-8");
        filesWritten++;
      }
    }

    return {
      locales,
      namespaces,
      filesWritten,
    };
  }

  /**
   * Read translations from local files
   */
  async readTranslations(options: ReadTranslationsOptions = {}): Promise<LocalTranslations> {
    const result: TranslationData = {};
    const foundLocales = new Set<string>();
    const foundNamespaces = new Set<string>();

    // Find all translation files
    const files = await this.findTranslationFiles();

    for (const { locale, namespace, filePath } of files) {
      // Apply filters
      if (options.locales?.length && !options.locales.includes(locale)) {
        continue;
      }
      if (options.namespaces?.length && !options.namespaces.includes(namespace)) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const translations = JSON.parse(content) as Record<string, string>;

        if (!result[locale]) {
          result[locale] = {};
        }
        result[locale][namespace] = translations;

        foundLocales.add(locale);
        foundNamespaces.add(namespace);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new TypegenError(
            `Invalid JSON in ${filePath}: ${error.message}`,
            ErrorCodes.CONFIG_INVALID,
          );
        }
        throw wrapError(error, `Failed to read ${filePath}`, ErrorCodes.FS_READ_FAILED);
      }
    }

    return {
      translations: result,
      locales: Array.from(foundLocales),
      namespaces: Array.from(foundNamespaces),
    };
  }

  /**
   * Clear the translations directory
   */
  async clearDirectory(): Promise<void> {
    try {
      const cwd = resolve(process.cwd());
      const relativeToCwd = relative(cwd, this.translationsPath);

      if (
        relativeToCwd === "" ||
        relativeToCwd === ".." ||
        relativeToCwd.startsWith(`..${sep}`) ||
        isAbsolute(relativeToCwd)
      ) {
        throw new TypegenError(
          `Refusing to clear translations directory outside the current project: ${this.translationsPath}`,
          ErrorCodes.FS_WRITE_FAILED,
        );
      }

      await fs.rm(this.translationsPath, { recursive: true, force: true });
      await this.ensureDirectory(this.translationsPath);
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      throw wrapError(error, "Failed to clear directory", ErrorCodes.FS_WRITE_FAILED);
    }
  }

  /**
   * Compare local translations with remote translations
   */
  compareTranslations(local: TranslationData, remote: TranslationData): TranslationDiff {
    let created = 0;
    let updated = 0;
    let conflicts = 0;
    let deleted = 0;

    // Find created and conflicting keys. Conflicts are also the keys that would
    // be updated by an override push, so expose the value once through both
    // fields for command output and API compatibility.
    for (const locale of Object.keys(local)) {
      const localLocale = local[locale];
      const remoteLocale = remote[locale] || {};

      for (const ns of Object.keys(localLocale)) {
        const localNs = localLocale[ns];
        const remoteNs = remoteLocale[ns] || {};

        for (const key of Object.keys(localNs)) {
          if (!(key in remoteNs)) {
            created++;
          } else if (localNs[key] !== remoteNs[key]) {
            conflicts++;
            updated++;
          }
        }
      }
    }

    // Find deleted keys (in remote but not in local)
    for (const locale of Object.keys(remote)) {
      const localLocale = local[locale] || {};
      const remoteLocale = remote[locale];

      for (const ns of Object.keys(remoteLocale)) {
        const localNs = localLocale[ns] || {};
        const remoteNs = remoteLocale[ns];

        for (const key of Object.keys(remoteNs)) {
          if (!(key in localNs)) {
            deleted++;
          }
        }
      }
    }

    return { created, updated, conflicts, deleted };
  }

  /**
   * Resolve file path from template
   */
  private resolveFilePath(locale: string, namespace: string): string {
    const extension = this.format;

    const relativePath = this.fileTemplate
      .replace("{languageTag}", locale)
      .replace("{namespace}", namespace)
      .replace("{extension}", extension);

    return join(this.translationsPath, relativePath);
  }

  /**
   * Parse file path to extract locale (BCP 47 tag) and namespace.
   * The `{languageTag}` placeholder name is kept for backward compatibility
   * with existing `.comvirc.json` files; the captured value is a locale.
   */
  private parseFilePath(filePath: string): { locale: string; namespace: string } | null {
    const relativePath = relative(this.translationsPath, filePath).replace(/\\/g, "/");
    const template = this.fileTemplate.replace(/\\/g, "/");
    const placeholders: Record<string, string> = {
      "{languageTag}": "(?<locale>[A-Za-z0-9_-]+)",
      "{namespace}": "(?<namespace>[A-Za-z0-9_-]+)",
      "{extension}": "[A-Za-z]+",
    };

    const regexPattern = template
      .split(/(\{languageTag\}|\{namespace\}|\{extension\})/g)
      .map((part) => placeholders[part] ?? escapeRegExp(part))
      .join("");

    const regex = new RegExp(`^${regexPattern}$`);
    const match = relativePath.match(regex);

    if (match?.groups) {
      return {
        locale: match.groups.locale,
        namespace: match.groups.namespace,
      };
    }

    return null;
  }

  /**
   * Find all translation files in the translations directory
   */
  private async findTranslationFiles(): Promise<
    Array<{ locale: string; namespace: string; filePath: string }>
  > {
    const results: Array<{ locale: string; namespace: string; filePath: string }> = [];

    try {
      await this.walkDirectory(this.translationsPath, (filePath) => {
        if (filePath.endsWith(`.${this.format}`)) {
          const parsed = this.parseFilePath(filePath);
          if (parsed) {
            results.push({
              ...parsed,
              filePath,
            });
          }
        }
      });
    } catch (error) {
      // Directory doesn't exist, return empty array
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    return results;
  }

  /**
   * Recursively walk a directory
   */
  private async walkDirectory(dir: string, callback: (filePath: string) => void): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      throw wrapError(error, "Failed to create directory", ErrorCodes.FS_MKDIR_FAILED);
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
