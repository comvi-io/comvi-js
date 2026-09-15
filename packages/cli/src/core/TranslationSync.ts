import { promises as fs } from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "path";
import type {
  TranslationData,
  TranslationsResponse,
  TranslationSyncOptions,
  PullResult,
  TranslationDiff,
} from "../types";
import { DEFAULT_NAMESPACE, isDefaultFileTemplate } from "../defaults";
import { TypegenError, ErrorCodes, wrapError } from "../utils/errors";
import { atomicWriteFile } from "../utils/atomicWrite";

export interface ReadTranslationsOptions {
  locales?: string[];
  namespaces?: string[];
  defaultNamespace?: string;
}

export interface WriteTranslationsOptions {
  defaultNamespace?: string;
}

/**
 * Which translations a clear is allowed to touch, in `rsync --delete` terms: the
 * clear covers exactly the locales and namespaces the pull is about to write.
 * An empty scope (no locale and no namespace filter) means the whole directory.
 */
export interface ClearScope {
  locales?: string[];
  namespaces?: string[];
  defaultNamespace?: string;
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

  async writeTranslations(
    data: TranslationsResponse,
    options: WriteTranslationsOptions = {},
  ): Promise<PullResult> {
    const { translations, locales, namespaces } = data;
    const defaultNamespace = options.defaultNamespace ?? DEFAULT_NAMESPACE;
    let filesWritten = 0;

    for (const locale of locales) {
      const localeTranslations = translations[locale];
      if (!localeTranslations) continue;

      for (const ns of namespaces) {
        const nsTranslations = localeTranslations[ns];
        if (!nsTranslations) continue;

        const filePath = this.resolveFilePath(locale, ns, defaultNamespace);
        const directory = dirname(filePath);

        // Before mkdir: an existing directory on the way down may be a symlink
        // that leaves the tree, and `mkdir -p` would follow it silently.
        await this.assertRealPathContained(directory);
        await this.ensureDirectory(directory);
        // Before the write: the target itself may be a symlink out of the tree.
        await this.assertRealPathContained(filePath);

        const content = JSON.stringify(nsTranslations, null, 2) + "\n";
        await atomicWriteFile(filePath, content);
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
   * List the file paths writeTranslations would produce, without writing
   */
  previewTranslations(
    data: TranslationsResponse,
    options: WriteTranslationsOptions = {},
  ): { files: string[] } {
    const { translations, locales, namespaces } = data;
    const defaultNamespace = options.defaultNamespace ?? DEFAULT_NAMESPACE;
    const files: string[] = [];

    for (const locale of locales) {
      const localeTranslations = translations[locale];
      if (!localeTranslations) continue;

      for (const ns of namespaces) {
        if (!localeTranslations[ns]) continue;
        files.push(this.resolveFilePath(locale, ns, defaultNamespace));
      }
    }

    return { files };
  }

  async readTranslations(options: ReadTranslationsOptions = {}): Promise<LocalTranslations> {
    const defaultNamespace = options.defaultNamespace ?? DEFAULT_NAMESPACE;
    const result: TranslationData = {};
    const foundLocales = new Set<string>();
    const foundNamespaces = new Set<string>();
    const sourceFiles = new Map<string, string>();

    const files = await this.findTranslationFiles(defaultNamespace);

    for (const { locale, namespace, filePath } of files) {
      if (options.locales?.length && !options.locales.includes(locale)) {
        continue;
      }
      if (options.namespaces?.length && !options.namespaces.includes(namespace)) {
        continue;
      }

      const translationSlot = `${locale}\u0000${namespace}`;
      const existingFilePath = sourceFiles.get(translationSlot);
      if (existingFilePath) {
        throw new TypegenError(
          `Duplicate translation files for locale "${locale}" and namespace "${namespace}": ${existingFilePath} and ${filePath}`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
      sourceFiles.set(translationSlot, filePath);

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const parsed: unknown = JSON.parse(content);

        if (!isPlainObject(parsed)) {
          throw new TypegenError(
            `Invalid translation file ${filePath}: expected a JSON object of translations, got ${describeValue(parsed)}`,
            ErrorCodes.CONFIG_INVALID,
          );
        }

        const translations = flattenTranslationFile(parsed, filePath);

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
   * Remove the translation files a pull is about to replace.
   *
   * With no scope this is the whole directory. With a locale or namespace
   * filter it is only the files that filter selects, so a filtered pull never
   * deletes translations it was never going to fetch; directories the walk
   * leaves empty are removed with them.
   */
  async clearDirectory(scope?: ClearScope): Promise<void> {
    this.assertInsideProject();

    try {
      if (!isScopedClear(scope)) {
        await fs.rm(this.translationsPath, { recursive: true, force: true });
        await this.ensureDirectory(this.translationsPath);
        return;
      }

      const files = await this.listFilesToClear(scope);
      for (const filePath of files) {
        await fs.unlink(filePath);
      }

      // Nothing was unlinked, so nothing was emptied — and the translations
      // directory may not even exist yet.
      if (files.length > 0) {
        await this.removeEmptyDirectories(this.translationsPath, true);
      }
    } catch (error) {
      throw wrapError(error, "Failed to clear directory", ErrorCodes.FS_WRITE_FAILED);
    }
  }

  /**
   * List the files `clearDirectory` would remove for the same scope, sorted, so
   * `--dry-run` can name every one of them.
   */
  async previewClear(scope?: ClearScope): Promise<string[]> {
    this.assertInsideProject();

    try {
      if (isScopedClear(scope)) {
        return await this.listFilesToClear(scope);
      }

      const files: string[] = [];
      await this.walkDirectory(this.translationsPath, (filePath) => {
        files.push(filePath);
      });
      return files.sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw wrapError(error, "Failed to list directory", ErrorCodes.FS_WRITE_FAILED);
    }
  }

  /** A path outside the project is never a pull target; refuse before deleting anything. */
  private assertInsideProject(): void {
    if (!isBeneathDirectory(resolve(process.cwd()), this.translationsPath)) {
      throw new TypegenError(
        `Refusing to clear translations directory outside the current project: ${this.translationsPath}`,
        ErrorCodes.FS_WRITE_FAILED,
      );
    }
  }

  private async listFilesToClear(scope: ClearScope): Promise<string[]> {
    const files = await this.findTranslationFiles(scope.defaultNamespace ?? DEFAULT_NAMESPACE);

    return files
      .filter(
        ({ locale, namespace }) =>
          (!scope.locales?.length || scope.locales.includes(locale)) &&
          (!scope.namespaces?.length || scope.namespaces.includes(namespace)),
      )
      .map(({ filePath }) => filePath)
      .sort();
  }

  /**
   * Remove directories the clear emptied, deepest first. The translations
   * directory itself is kept: the pull writes into it next.
   */
  private async removeEmptyDirectories(dir: string, isRoot: boolean): Promise<boolean> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    let isEmpty = true;
    for (const entry of entries) {
      const removed =
        entry.isDirectory() && (await this.removeEmptyDirectories(join(dir, entry.name), false));
      if (!removed) {
        isEmpty = false;
      }
    }

    if (isEmpty && !isRoot) {
      await fs.rmdir(dir);
      return true;
    }

    return false;
  }

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

  private resolveFilePath(locale: string, namespace: string, defaultNamespace: string): string {
    const extension = this.format;

    // The identifiers come from the translations response, not from the
    // project: refuse anything that is not a plain name before it becomes a
    // path segment.
    assertPathSegment(locale, "locale from API response");
    assertPathSegment(namespace, "namespace from API response");

    if (this.usesDefaultFileLayout() && namespace === defaultNamespace) {
      return this.assertContained(join(this.translationsPath, `${locale}.${extension}`));
    }

    const relativePath = this.fileTemplate
      .replace("{languageTag}", locale)
      .replace("{namespace}", namespace)
      .replace("{extension}", extension);

    return this.assertContained(join(this.translationsPath, relativePath));
  }

  /**
   * Lexical containment: the resolved target must be strictly below the
   * translations directory. Compared with `path.relative`, not a string
   * prefix, so `/locales-other` is not mistaken for a child of `/locales`.
   */
  private assertContained(filePath: string): string {
    const resolved = resolve(filePath);

    if (!isBeneathDirectory(this.translationsPath, resolved)) {
      throw new TypegenError(
        `Refusing to write translations outside "${this.translationsPath}": resolved path "${resolved}" ` +
          `escapes the configured translations directory`,
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    return resolved;
  }

  /**
   * `path.relative` cannot see through a symlink, so a directory or file
   * inside the tree may still point out of it. Resolve the deepest part of the
   * target that exists on disk and re-check it against the resolved root —
   * `translationsPath` itself is allowed to be a symlink.
   */
  private async assertRealPathContained(target: string): Promise<void> {
    // Both sides go through the same resolution: the first pull runs before
    // the translations directory exists, and on macOS the temp and home trees
    // are themselves symlinks, so resolving only one side would compare
    // `/var/...` against `/private/var/...`.
    const root = await realPathOfExistingPrefix(this.translationsPath);
    const resolved = await realPathOfExistingPrefix(target);

    if (!isWithinDirectory(root, resolved)) {
      throw new TypegenError(
        `Refusing to write translations outside "${this.translationsPath}": "${target}" resolves to ` +
          `"${resolved}" through a symlink that leaves the translations directory`,
        ErrorCodes.VALIDATION_FAILED,
      );
    }
  }

  /**
   * Parse file path to extract locale (BCP 47 tag) and namespace.
   * The `{languageTag}` placeholder name is kept for backward compatibility
   * with existing `.comvirc.json` files; the captured value is a locale.
   */
  private parseFilePath(
    filePath: string,
    defaultNamespace: string,
  ): { locale: string; namespace: string } | null {
    const relativePath = relative(this.translationsPath, filePath).replace(/\\/g, "/");
    const template = this.fileTemplate.replace(/\\/g, "/");

    if (this.usesDefaultFileLayout()) {
      const defaultNamespaceFile = parseDefaultNamespaceFile(relativePath, this.format);
      if (defaultNamespaceFile) {
        return {
          locale: defaultNamespaceFile,
          namespace: defaultNamespace,
        };
      }
    }

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

    if (match?.groups?.locale && match.groups.namespace) {
      return {
        locale: match.groups.locale,
        namespace: match.groups.namespace,
      };
    }

    return null;
  }

  private usesDefaultFileLayout(): boolean {
    return isDefaultFileTemplate(this.fileTemplate);
  }

  private async findTranslationFiles(
    defaultNamespace: string,
  ): Promise<Array<{ locale: string; namespace: string; filePath: string }>> {
    const results: Array<{ locale: string; namespace: string; filePath: string }> = [];

    try {
      await this.walkDirectory(this.translationsPath, (filePath) => {
        if (filePath.endsWith(`.${this.format}`)) {
          const parsed = this.parseFilePath(filePath, defaultNamespace);
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

/**
 * A locale or namespace that is about to become a path segment: one plain
 * name, so no `/`, no `\`, no `..`, and no leading dot that would hide the
 * file or start a traversal.
 */
const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function assertPathSegment(value: string, source: string): void {
  if (!PATH_SEGMENT.test(value)) {
    throw new TypegenError(
      `Invalid ${source}: ${JSON.stringify(value)} is not a usable file name — ` +
        `expected a name matching ${PATH_SEGMENT.source}`,
      ErrorCodes.VALIDATION_FAILED,
    );
  }
}

/**
 * `candidate` is `root` itself, or a path below it. The relative form is what
 * decides, so a sibling directory whose name merely starts with the root's
 * (`/locales-backup` under `/locales`) is not mistaken for a child; a path on
 * another Windows drive has no relative form and comes back absolute.
 */
function isWithinDirectory(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);

  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

/** `candidate` is strictly below `root` — never the directory itself. */
function isBeneathDirectory(root: string, candidate: string): boolean {
  return relative(root, candidate) !== "" && isWithinDirectory(root, candidate);
}

/**
 * The target does not exist yet — that is the point of writing it. Walk up to
 * the deepest ancestor the OS can resolve, resolve its symlinks, and re-attach
 * the part that is still missing.
 *
 * Every failure walks further up rather than aborting: a missing directory is
 * ENOENT, a file where a directory is expected is ENOTDIR, a symlink loop is
 * ELOOP. None of them can hide an escape, because the write that follows needs
 * the same resolution the OS just refused; reporting it here would only
 * replace the real mkdir/write error with a worse one.
 */
async function realPathOfExistingPrefix(target: string): Promise<string> {
  let current = resolve(target);
  const missing: string[] = [];

  for (;;) {
    try {
      return join(await fs.realpath(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return join(current, ...missing);
      }
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

function parseDefaultNamespaceFile(relativePath: string, format: "json"): string | null {
  const regex = new RegExp(`^([A-Za-z0-9_-]+)\\.${escapeRegExp(format)}$`);
  return relativePath.match(regex)?.[1] ?? null;
}

/** An empty scope clears everything; any filter narrows it. */
function isScopedClear(scope?: ClearScope): scope is ClearScope {
  return Boolean(scope?.locales?.length || scope?.namespaces?.length);
}

/**
 * Only a `{}`-shaped value counts as nesting. Arrays and class instances are
 * leaves, and since they are not strings the flattener rejects them.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * Flatten a parsed translation file to the dotted keys the API stores, so
 * `{"nav": {"home": "Home"}}` uploads as `"nav.home"`. `pull` writes the flat
 * form, so an already-flat file passes through key for key.
 *
 * Non-string leaves are a hard error rather than a coercion: the API
 * stringifies whatever it is handed, so a number, boolean, null or array
 * would previously have been uploaded as its `String()` form (a nested object
 * as the literal `[object Object]`) with nothing to show for it.
 */
function flattenTranslationFile(
  catalog: Record<string, unknown>,
  filePath: string,
): Record<string, string> {
  // Null prototype so a key literally named `__proto__` lands as data instead
  // of hitting Object.prototype's setter and vanishing.
  const result: Record<string, string> = Object.create(null) as Record<string, string>;

  const visit = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "string") {
        if (fullKey in result) {
          throw new TypegenError(
            `Duplicate translation key in ${filePath}: "${fullKey}" is defined both as a flat key and through nesting`,
            ErrorCodes.CONFIG_INVALID,
          );
        }
        result[fullKey] = value;
      } else if (isPlainObject(value)) {
        visit(value, fullKey);
      } else {
        throw new TypegenError(
          `Invalid translation value in ${filePath}: key "${fullKey}" is ${describeValue(value)}, ` +
            `expected a string or a nested object of strings`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
    }
  };

  visit(catalog, "");
  return result;
}
