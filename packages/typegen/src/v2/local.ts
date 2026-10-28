/**
 * A local directory of JSON catalogs as a wire schema v2 — the same schema the platform
 * route returns for the same catalogs (`build.ts`).
 *
 * Layout (the CDN's, `@comvi/core/cdn`): `<locale>.json` is the `default` namespace,
 * `<ns>/<locale>.json` namespace `ns`. Another `fileTemplate` names the two parts with
 * `{languageTag}` and `{namespace}`. Catalogs are FLAT, as core reads them (`a.b` is a
 * key, not a path); a value that is not a string is reported and left out, as core
 * reports it at runtime.
 *
 * Reading is per namespace and cached: {@link LocalSource.refresh} re-reads only the
 * namespaces it is told changed, and within them parses only a file whose text changed
 * (a file-system event without a change — an editor's touch, FSEvents replaying recent
 * history at watch start — costs a read, not a parse). {@link LocalSource.parsedFiles}
 * counts every file parsed: the watch-mode gate counts work, not milliseconds.
 */
import fs from "node:fs";
import path from "node:path";
import { buildWireKey, type SchemaWarning } from "./build";
import { readMessage, type ReadMessage } from "./read";
import { byCodeUnit, record, WIRE_VERSION, type WireKey, type WireSchema } from "./wire";

export const DEFAULT_NAMESPACE = "default";
export const DEFAULT_FILE_TEMPLATE = "{namespace}/{languageTag}.json";

export interface LocalSourceOptions {
  /** The directory of catalogs. */
  dir: string;
  /** The locale whose messages define the types; the only locale, when there is one. */
  sourceLocale?: string;
  /** @default '{namespace}/{languageTag}.json' (and `{languageTag}.json` for `default`) */
  fileTemplate?: string;
}

/** A catalog file that cannot be read: the schema keeps its last good reading. */
export class CatalogFileError extends Error {
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`${file}: ${reason}`);
    this.name = "CatalogFileError";
  }
}

interface FileRef {
  ns: string;
  locale: string;
  file: string;
}

function templateRegex(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped
      .replace("\\{languageTag\\}", "(?<locale>[^/]+)")
      .replace("\\{namespace\\}", "(?<ns>[^/]+)")}$`,
  );
}

function listFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, rel));
    else if (entry.name.endsWith(".json")) out.push(rel);
  }
  return out;
}

export class LocalSource {
  readonly dir: string;
  /** Files read since this source was created (only the namespaces refresh() was told). */
  readFiles = 0;
  /** Files parsed since this source was created (only those whose text changed). */
  parsedFiles = 0;
  private readonly template: RegExp;
  private readonly rootTemplate: RegExp | undefined;
  private readonly configuredSource: string | undefined;
  /** ns → locale → key → message read; the cache refresh() keeps. */
  private readonly read = new Map<string, Map<string, Record<string, ReadMessage>>>();
  /** ns → locale → file. */
  private files = new Map<string, Map<string, string>>();
  /** file → its last text and what was parsed from it. */
  private readonly parsed = new Map<
    string,
    { text: string; messages: Record<string, ReadMessage>; issues: SchemaWarning[] }
  >();
  /** Issues found while reading, per namespace (replaced when it is re-read). */
  private readonly issues = new Map<string, SchemaWarning[]>();

  constructor(options: LocalSourceOptions) {
    this.dir = path.resolve(options.dir);
    const template = (options.fileTemplate ?? DEFAULT_FILE_TEMPLATE).replace(/\\/g, "/");
    if (template.split("{languageTag}").length !== 2)
      throw new Error(`fileTemplate must contain {languageTag} once, received "${template}"`);
    this.template = templateRegex(template);
    // The default layout keeps the CDN's root files: `<locale>.json` is `default`.
    this.rootTemplate =
      template === DEFAULT_FILE_TEMPLATE ? templateRegex("{languageTag}.json") : undefined;
    this.configuredSource = options.sourceLocale;
  }

  /** The namespace `file` (absolute or relative to the dir) belongs to, or `undefined`. */
  namespaceOf(file: string): FileRef | undefined {
    const rel = path.relative(this.dir, path.resolve(this.dir, file)).split(path.sep).join("/");
    if (rel.startsWith("../")) return undefined;
    const m = rel.match(this.template) ?? (this.rootTemplate && rel.match(this.rootTemplate));
    if (!m?.groups) return undefined;
    return { ns: m.groups.ns ?? DEFAULT_NAMESPACE, locale: m.groups.locale, file: rel };
  }

  private scan(): void {
    const files = new Map<string, Map<string, string>>();
    let entries: string[];
    try {
      entries = listFiles(this.dir);
    } catch (e) {
      throw new Error(`Cannot read the catalogs directory ${this.dir}: ${(e as Error).message}`);
    }
    for (const rel of entries.sort(byCodeUnit)) {
      const ref = this.namespaceOf(rel);
      if (!ref) continue;
      let byLocale = files.get(ref.ns);
      if (!byLocale) files.set(ref.ns, (byLocale = new Map()));
      byLocale.set(ref.locale, rel);
    }
    this.files = files;
  }

  private readNamespace(ns: string): void {
    const byLocale = new Map<string, Record<string, ReadMessage>>();
    const issues: SchemaWarning[] = [];
    for (const [locale, rel] of this.files.get(ns) ?? []) {
      const full = path.join(this.dir, rel);
      let text: string;
      try {
        text = fs.readFileSync(full, "utf8");
        this.readFiles++;
      } catch (e) {
        throw new CatalogFileError(full, (e as Error).message);
      }
      let file = this.parsed.get(full);
      if (file?.text !== text) {
        this.parsedFiles++;
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch (e) {
          throw new CatalogFileError(full, `invalid JSON (${(e as Error).message})`);
        }
        if (typeof json !== "object" || json === null || Array.isArray(json))
          throw new CatalogFileError(full, "a catalog is a JSON object of keys to messages");
        const messages = record<ReadMessage>();
        const fileIssues: SchemaWarning[] = [];
        for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
          if (typeof value === "string") messages[key] = readMessage(value);
          else
            fileIssues.push({
              namespace: ns,
              key,
              locale,
              message: `the value is not a string; catalogs are flat (flatten nested objects) — left out`,
            });
        }
        file = { text, messages, issues: fileIssues };
        this.parsed.set(full, file);
      }
      byLocale.set(locale, file.messages);
      issues.push(...file.issues);
    }
    this.read.set(ns, byLocale);
    this.issues.set(ns, issues);
  }

  /**
   * (Re-)reads the namespaces named, or every namespace when `namespaces` is undefined.
   * The directory listing is refreshed every time (a new file is a new namespace or
   * locale); file contents only for those namespaces.
   */
  refresh(namespaces?: Iterable<string>): void {
    this.scan();
    for (const ns of [...this.read.keys()]) if (!this.files.has(ns)) this.read.delete(ns);
    const todo = namespaces === undefined ? [...this.files.keys()] : [...namespaces];
    for (const ns of this.files.keys()) if (!this.read.has(ns) && !todo.includes(ns)) todo.push(ns);
    for (const ns of todo) {
      if (this.files.has(ns)) this.readNamespace(ns);
      else {
        this.read.delete(ns);
        this.issues.delete(ns);
      }
    }
  }

  /** Every locale seen, sorted. */
  locales(): string[] {
    const all = new Set<string>();
    for (const byLocale of this.files.values()) for (const l of byLocale.keys()) all.add(l);
    return [...all].sort(byCodeUnit);
  }

  sourceLocale(): string {
    if (this.configuredSource) return this.configuredSource;
    const locales = this.locales();
    if (locales.length === 1) return locales[0];
    throw new Error(
      locales.length === 0
        ? `No catalogs found in ${this.dir} (expected <locale>.json or <namespace>/<locale>.json)`
        : `Set sourceLocale: ${this.dir} has ${locales.join(", ")}, and the types come from one of them`,
    );
  }

  /** The schema of what was last read, and every warning about it. */
  schema(): { schema: WireSchema; warnings: SchemaWarning[] } {
    const sourceLocale = this.sourceLocale();
    const namespaces = record<Record<string, WireKey>>();
    const warnings: SchemaWarning[] = [];
    for (const ns of [...this.read.keys()].sort(byCodeUnit)) {
      const byLocale = this.read.get(ns)!;
      const keys = new Set<string>();
      for (const messages of byLocale.values()) for (const k of Object.keys(messages)) keys.add(k);
      const out = record<WireKey>();
      for (const key of [...keys].sort(byCodeUnit)) {
        const messages = record<ReadMessage>();
        for (const [locale, m] of byLocale) if (Object.hasOwn(m, key)) messages[locale] = m[key];
        const built = buildWireKey(messages, sourceLocale, { namespace: ns, key });
        out[key] = built.entry;
        warnings.push(...built.warnings);
      }
      namespaces[ns] = out;
      warnings.push(...(this.issues.get(ns) ?? []));
    }
    return { schema: { v: WIRE_VERSION, sourceLocale, namespaces }, warnings };
  }
}
