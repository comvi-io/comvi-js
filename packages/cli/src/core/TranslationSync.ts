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
import { emptyDictionary, hasOwnKey } from "../utils/dictionary";
import { findLocale } from "../utils/locales";
import {
  detectJsonStyle,
  resolveJsonStyle,
  stringifyJson,
  type JsonStyle,
} from "../utils/jsonStyle";

export interface ReadTranslationsOptions {
  locales?: string[];
  namespaces?: string[];
  defaultNamespace?: string;
}

export interface WriteTranslationsOptions {
  defaultNamespace?: string;
  /** Its files give new files their indentation and line endings. */
  sourceLocale?: string;
  /**
   * Files outside the catalogs written in the same operation, after them (`comvi pull`'s
   * `.comvi/schema.json`): if any write fails, every catalog and every one of these is
   * put back as it was — never new catalogs beside an old schema.
   */
  alongside?: ReadonlyArray<{ filePath: string; content: string }>;
}

/**
 * Which translations a clear is allowed to touch, in `rsync --delete` terms.
 * Only files the template parses as a translation file are ever candidates;
 * `locales` and `namespaces` narrow that further, and an empty list selects
 * nothing.
 */
export interface ClearScope {
  locales?: string[];
  namespaces?: string[];
  defaultNamespace?: string;
}

/** One file a response resolves to, in the order `writeTranslations` writes them. */
interface PlannedWrite {
  locale: string;
  namespace: string;
  filePath: string;
  catalog: Record<string, string>;
}

/** What a pull would do to one file, key by key. */
export interface PullFileDiff {
  filePath: string;
  status: "new" | "changed" | "unchanged" | "unreadable";
  added: string[];
  changed: string[];
  /** Keys in the local file the platform does not have: the pull drops them. */
  removed: string[];
  /** The local file nests keys that the pull writes flat. */
  nested: boolean;
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
    const planned = this.planWrites(data, options.defaultNamespace ?? DEFAULT_NAMESPACE);

    // Every target is resolved and checked before the first mkdir, so a name
    // the CLI refuses leaves nothing behind.
    await this.assertPlanContained(planned);
    const styles = await this.planStyles(planned, data, options);
    if (!options.alongside?.length) return this.writePlanned(planned, styles);
    return this.transact(planned, styles, undefined, options.alongside);
  }

  private async writePlanned(
    planned: PlannedWrite[],
    styles: Map<string, Required<JsonStyle>>,
  ): Promise<PullResult> {
    for (const { filePath, catalog } of planned) {
      await this.ensureDirectory(dirname(filePath));
      await atomicWriteFile(filePath, stringifyJson(catalog, styles.get(filePath)!));
    }

    return {
      locales: [...new Set(planned.map(({ locale }) => locale))],
      namespaces: [...new Set(planned.map(({ namespace }) => namespace))],
      filesWritten: planned.length,
    };
  }

  /**
   * `pull --empty-dir`: clear `scope`, then write the response, as one
   * operation. Each file write is atomic but the set is not, so an I/O failure
   * partway (ENOSPC, a permission change) used to leave the old catalog
   * deleted and only a prefix of the new one on disk. Every file the clear
   * removes or a write replaces is read into memory first; on any failure the
   * files this call created are removed and the snapshot is written back.
   */
  async replaceTranslations(
    data: TranslationsResponse,
    scope: ClearScope | undefined,
    options: WriteTranslationsOptions = {},
  ): Promise<PullResult> {
    const planned = this.planWrites(data, options.defaultNamespace ?? DEFAULT_NAMESPACE);
    await this.assertPlanContained(planned);
    // Read before the clear removes the files that show it.
    const styles = await this.planStyles(planned, data, options);
    return this.transact(planned, styles, scope ?? {}, options.alongside ?? []);
  }

  /**
   * Writes `planned` (after clearing `clear`, when given) and then `alongside`, as one
   * operation: every file it would remove or replace is read into memory first, and on
   * any failure the files it created are removed and the snapshot is written back.
   */
  private async transact(
    planned: PlannedWrite[],
    styles: Map<string, Required<JsonStyle>>,
    clear: ClearScope | undefined,
    alongside: ReadonlyArray<{ filePath: string; content: string }>,
  ): Promise<PullResult> {
    const targets = [
      ...planned.map(({ filePath }) => filePath),
      ...alongside.map(({ filePath }) => filePath),
    ];
    const snapshot = new Map<string, Buffer>();
    const touched = new Set([...(clear ? await this.previewClear(clear) : []), ...targets]);
    for (const filePath of touched) {
      try {
        snapshot.set(filePath, await fs.readFile(filePath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw wrapError(error, `Failed to read ${filePath}`, ErrorCodes.FS_READ_FAILED);
        }
      }
    }

    try {
      if (clear) await this.clearDirectory(clear);
      const result = await this.writePlanned(planned, styles);
      for (const { filePath, content } of alongside) {
        await fs.mkdir(dirname(filePath), { recursive: true });
        await atomicWriteFile(filePath, content);
      }
      return result;
    } catch (error) {
      await this.restoreSnapshot(snapshot, targets, error);
      throw error;
    }
  }

  private async restoreSnapshot(
    snapshot: Map<string, Buffer>,
    targets: string[],
    cause: unknown,
  ): Promise<void> {
    const unrestored: string[] = [];

    const created = targets.filter((p) => !snapshot.has(p));
    for (const filePath of created) {
      await fs.rm(filePath, { force: true }).catch(() => unrestored.push(filePath));
    }
    for (const [filePath, content] of snapshot) {
      try {
        await fs.mkdir(dirname(filePath), { recursive: true });
        await atomicWriteFile(filePath, content);
      } catch {
        unrestored.push(filePath);
      }
    }
    await this.pruneEmptyParents(created).catch(() => undefined);

    if (unrestored.length > 0) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new TypegenError(
        `Pull failed (${reason}) and these files could not be restored: ${unrestored.join(", ")}`,
        ErrorCodes.FS_WRITE_FAILED,
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /**
   * Run every check `writeTranslations` performs, and write nothing.
   *
   * `pull --empty-dir` clears the translations directory before it writes, so
   * the names have to be judged before the clear: a rejection from inside the
   * write loop would delete the catalog, restore the namespaces sorted before
   * the offending one, and lose the rest on every run.
   */
  async assertWritable(
    data: TranslationsResponse,
    options: WriteTranslationsOptions = {},
  ): Promise<void> {
    const planned = this.planWrites(data, options.defaultNamespace ?? DEFAULT_NAMESPACE);

    await this.assertPlanContained(planned);
  }

  /**
   * The file a catalog of `locale` and `namespace` lives in, after the same
   * name and containment checks a pull applies (symlinks included). Nothing
   * is read or written.
   */
  async catalogPath(locale: string, namespace: string, defaultNamespace?: string): Promise<string> {
    const filePath = this.resolveFilePath(locale, namespace, defaultNamespace ?? DEFAULT_NAMESPACE);
    await this.assertRealPathContained(dirname(filePath));
    await this.assertRealPathContained(filePath);
    return filePath;
  }

  /** The translation files on disk, as the template parses them. */
  async listCatalogFiles(
    defaultNamespace = DEFAULT_NAMESPACE,
  ): Promise<Array<{ locale: string; namespace: string; filePath: string }>> {
    return this.findTranslationFiles(defaultNamespace);
  }

  /**
   * List the file paths writeTranslations would produce, without writing
   */
  previewTranslations(
    data: TranslationsResponse,
    options: WriteTranslationsOptions = {},
  ): { files: string[] } {
    const planned = this.planWrites(data, options.defaultNamespace ?? DEFAULT_NAMESPACE);

    return { files: planned.map(({ filePath }) => filePath) };
  }

  /** Compare each file the response would write with the file on disk now. */
  async diffPull(
    data: TranslationsResponse,
    options: WriteTranslationsOptions = {},
  ): Promise<PullFileDiff[]> {
    const planned = this.planWrites(data, options.defaultNamespace ?? DEFAULT_NAMESPACE);
    // Never read through a symlink that leaves the tree.
    await this.assertPlanContained(planned);
    const diffs: PullFileDiff[] = [];

    for (const { filePath, catalog } of planned) {
      const incoming = Object.keys(catalog);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await fs.readFile(filePath, "utf-8"));
      } catch (error) {
        const isNew = (error as NodeJS.ErrnoException).code === "ENOENT";
        diffs.push({
          filePath,
          status: isNew ? "new" : "unreadable",
          added: isNew ? incoming : [],
          changed: [],
          removed: [],
          nested: false,
        });
        continue;
      }

      let local: Record<string, string>;
      try {
        if (!isPlainObject(parsed)) throw new Error("not an object");
        local = flattenTranslationFile(parsed, filePath);
      } catch {
        diffs.push({
          filePath,
          status: "unreadable",
          added: [],
          changed: [],
          removed: [],
          nested: false,
        });
        continue;
      }

      const added = incoming.filter((key) => !hasOwnKey(local, key));
      const changed = incoming.filter(
        (key) => hasOwnKey(local, key) && local[key] !== catalog[key],
      );
      const removed = Object.keys(local).filter((key) => !hasOwnKey(catalog, key));
      const nested = Object.values(parsed).some(isPlainObject);
      const differs = added.length + changed.length + removed.length > 0 || nested;
      diffs.push({
        filePath,
        status: differs ? "changed" : "unchanged",
        added,
        changed,
        removed,
        nested,
      });
    }

    return diffs;
  }

  /**
   * Resolve every file the response would produce, validating as it goes: each
   * locale and namespace the response declares, then each resolved path. The
   * caller gets the whole plan or an error, never half of it.
   */
  private planWrites(data: TranslationsResponse, defaultNamespace: string): PlannedWrite[] {
    for (const locale of data.locales) {
      assertPathSegment(locale, "locale from API response");
    }
    for (const namespace of data.namespaces) {
      assertPathSegment(namespace, "namespace from API response");
    }

    const planned: PlannedWrite[] = [];
    const owners = new Map<string, string>();

    for (const locale of data.locales) {
      const localeTranslations = data.translations[locale];
      if (!localeTranslations) continue;

      for (const namespace of data.namespaces) {
        const catalog = localeTranslations[namespace];
        if (!catalog) continue;

        const filePath = this.resolveFilePath(locale, namespace, defaultNamespace);
        // `{languageTag}-{namespace}.json` puts en + US-shop and en-US + shop
        // in one file; the second write would silently replace the first.
        const owner = `locale ${JSON.stringify(locale)}, namespace ${JSON.stringify(namespace)}`;
        // Compared as a case-insensitive file system sees it (macOS, Windows).
        const key = filePath.normalize("NFC").toLowerCase();
        const previous = owners.get(key);
        if (previous) {
          throw new TypegenError(
            `${previous} and ${owner} both resolve to ${filePath}. ` +
              "Use a fileTemplate that puts {languageTag} and {namespace} in separate path segments.",
            ErrorCodes.VALIDATION_FAILED,
          );
        }
        owners.set(key, owner);
        planned.push({
          locale,
          namespace,
          filePath,
          catalog,
        });
      }
    }

    // A file one catalog needs where another needs a directory: with the
    // default layout, namespace "en.json" would live at en.json/en.json.
    const root = this.translationsPath.normalize("NFC").toLowerCase();
    for (const [key, owner] of owners) {
      for (let dir = dirname(key); dir.length > root.length; dir = dirname(dir)) {
        const fileOwner = owners.get(dir);
        if (fileOwner) {
          throw new TypegenError(
            `${fileOwner} is written to a file that ${owner} needs as a directory. ` +
              "Rename the namespace or use a different fileTemplate.",
            ErrorCodes.VALIDATION_FAILED,
          );
        }
      }
    }

    return planned;
  }

  /**
   * Each file keeps its own layout; a new one takes that of the source
   * locale's file for its namespace, then the default.
   */
  private async planStyles(
    planned: PlannedWrite[],
    data: TranslationsResponse,
    options: WriteTranslationsOptions,
  ): Promise<Map<string, Required<JsonStyle>>> {
    const sourceLocale =
      options.sourceLocale === undefined
        ? undefined
        : (findLocale(options.sourceLocale, data.locales) ?? options.sourceLocale);
    const sourceStyles = new Map<string, JsonStyle>();
    const styles = new Map<string, Required<JsonStyle>>();

    for (const { namespace, filePath } of planned) {
      if (sourceLocale !== undefined && !sourceStyles.has(namespace)) {
        let sourcePath: string | undefined;
        try {
          sourcePath = await this.catalogPath(sourceLocale, namespace, options.defaultNamespace);
        } catch {
          // Not a file name, or a path out of the directory: no layout to borrow.
        }
        sourceStyles.set(
          namespace,
          detectJsonStyle(sourcePath === undefined ? null : await readTextOrNull(sourcePath)),
        );
      }
      styles.set(
        filePath,
        resolveJsonStyle(
          detectJsonStyle(await readTextOrNull(filePath)),
          sourceStyles.get(namespace) ?? {},
        ),
      );
    }
    return styles;
  }

  private async assertPlanContained(planned: PlannedWrite[]): Promise<void> {
    for (const { filePath } of planned) {
      // An existing directory on the way down may be a symlink that leaves the
      // tree, and `mkdir -p` would follow it silently; the target itself may be
      // one too.
      await this.assertRealPathContained(dirname(filePath));
      await this.assertRealPathContained(filePath);
    }
  }

  async readTranslations(options: ReadTranslationsOptions = {}): Promise<LocalTranslations> {
    const defaultNamespace = options.defaultNamespace ?? DEFAULT_NAMESPACE;
    // Keyed by locale and namespace names parsed off the file tree, so both
    // levels are null-prototype maps: a `__proto__.json` file must become an
    // entry, never a write through Object.prototype.
    const result: TranslationData = emptyDictionary();
    const foundLocales = new Set<string>();
    const foundNamespaces = new Set<string>();
    const sourceFiles = new Map<string, string>();

    const files = await this.findTranslationFiles(defaultNamespace);

    for (const { locale, namespace, filePath } of files) {
      if (options.locales?.length && !findLocale(locale, options.locales)) {
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

        result[locale] ??= emptyDictionary();
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
   * Remove the translation files a pull is about to replace: the files the
   * template parses as translations, within `scope`. Files the template does
   * not match are never touched; directories only these removals emptied are
   * removed with them.
   */
  async clearDirectory(scope: ClearScope = {}): Promise<void> {
    this.assertInsideProject();

    try {
      const files = await this.listFilesToClear(scope);
      for (const filePath of files) {
        await fs.unlink(filePath);
      }

      await this.pruneEmptyParents(files);
    } catch (error) {
      throw wrapError(error, "Failed to clear directory", ErrorCodes.FS_WRITE_FAILED);
    }
  }

  /**
   * List the files `clearDirectory` would remove for the same scope, sorted, so
   * `--dry-run` can name every one of them.
   */
  async previewClear(scope: ClearScope = {}): Promise<string[]> {
    this.assertInsideProject();

    try {
      return await this.listFilesToClear(scope);
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
        ErrorCodes.VALIDATION_FAILED,
      );
    }
  }

  private async listFilesToClear(scope: ClearScope): Promise<string[]> {
    // `{languageTag}-{namespace}.json` cannot tell `en` + `US-shop` from
    // `en-US` + `shop`, so a clear could delete a catalog it never received.
    if (hasPlaceholdersInOneSegment(this.fileTemplate)) {
      throw new TypegenError(
        `Cannot clear with fileTemplate ${JSON.stringify(this.fileTemplate)}: ` +
          "{languageTag} and {namespace} share a path segment, so a file name does not say " +
          "which locale it belongs to. Put them in separate directories, or pull without --empty-dir.",
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    const files = await this.findTranslationFiles(scope.defaultNamespace ?? DEFAULT_NAMESPACE);

    return files
      .filter(
        ({ locale, namespace }) =>
          (scope.locales === undefined || scope.locales.includes(locale)) &&
          (scope.namespaces === undefined || scope.namespaces.includes(namespace)),
      )
      .map(({ filePath }) => filePath)
      .sort();
  }

  /**
   * Remove the directories that removing `files` left empty, walking up to but
   * never including the translations directory. A directory that was empty
   * before, or still holds anything, stays.
   */
  private async pruneEmptyParents(files: string[]): Promise<void> {
    const directories = [...new Set(files.map((file) => dirname(file)))].sort(
      (a, b) => b.length - a.length,
    );
    for (let dir of directories) {
      while (isBeneathDirectory(this.translationsPath, dir)) {
        try {
          await fs.rmdir(dir);
        } catch {
          break;
        }
        dir = dirname(dir);
      }
    }
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
          // `key in remoteNs` answers true for `constructor` or `toString` on
          // an ordinary object, so a new key named after an inherited member
          // used to count as a changed one.
          if (!hasOwnKey(remoteNs, key)) {
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
          if (!hasOwnKey(localNs, key)) {
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

    // Any non-separator segment is captured, then judged by the same policy
    // the write side applies: whatever `pull` can write, `push` must read back.
    const placeholders: Record<string, string> = {
      "{languageTag}": "(?<locale>[^/]+)",
      "{namespace}": "(?<namespace>[^/]+)",
      "{extension}": "[A-Za-z]+",
    };

    const regexPattern = template
      .split(/(\{languageTag\}|\{namespace\}|\{extension\})/g)
      .map((part) => placeholders[part] ?? escapeRegExp(part))
      .join("");

    const regex = new RegExp(`^${regexPattern}$`);
    const match = relativePath.match(regex);
    // A template without `{namespace}` (`{languageTag}.json`, which `check`
    // accepts) holds one catalog per locale: the default namespace.
    const namespace = match?.groups?.namespace ?? defaultNamespace;

    if (
      match?.groups?.locale &&
      unsafePathSegmentReason(match.groups.locale) === undefined &&
      unsafePathSegmentReason(namespace) === undefined
    ) {
      return {
        locale: match.groups.locale,
        namespace,
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

function hasPlaceholdersInOneSegment(template: string): boolean {
  return template
    .replace(/\\/g, "/")
    .split("/")
    .some((segment) => segment.includes("{languageTag}") && segment.includes("{namespace}"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A C0 control character or DEL. Written as a scan rather than a regular
 * expression because a control character inside a regex literal is itself
 * unreadable (and `no-control-regex` refuses it); a surrogate pair reports its
 * high surrogate, which is never a control character.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

/**
 * Why a locale or namespace cannot be used as one path segment, or undefined
 * when it can.
 *
 * The platform validates a namespace as 1-255 characters and a locale code as
 * 1-50, with no character class at all, so a name holding a space, an `@` or
 * non-ASCII text is legal to create in the product and has to pull. Only what
 * makes a path unsafe is refused here; containment itself is enforced by
 * `assertContained` and `assertRealPathContained`, which is where the boundary
 * actually is. A leading dot covers `.` and `..` along with hidden names.
 */
function unusableSegmentReason(value: string): string | undefined {
  if (value === "__proto__") return "it is a reserved JavaScript property name";
  return unsafePathSegmentReason(value);
}

/**
 * The path-shape half of `unusableSegmentReason`, shared with the read side so
 * a name `pull` writes is a name `push` reads back. Reading does not need the
 * `__proto__` refusal: its maps are null-prototype, so a `__proto__.json`
 * file is just an entry.
 */
function unsafePathSegmentReason(value: string): string | undefined {
  if (value === "") return "it is empty";
  if (value.includes("/") || value.includes("\\")) return "it contains a path separator";
  if (hasControlCharacter(value)) return "it contains a control character";
  if (value.startsWith(".")) return "it starts with a dot";
  return undefined;
}

/** A file that cannot be read shows no layout; writing it reports the real error. */
async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

function assertPathSegment(value: string, source: string): void {
  const reason = unusableSegmentReason(value);

  if (reason) {
    throw new TypegenError(
      `Invalid ${source}: ${JSON.stringify(value)} cannot be used as a file name — ${reason}`,
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
  const regex = new RegExp(`^([^/]+)\\.${escapeRegExp(format)}$`);
  const locale = relativePath.match(regex)?.[1];
  return locale !== undefined && unsafePathSegmentReason(locale) === undefined ? locale : null;
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
  const result: Record<string, string> = emptyDictionary();

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
