import { promises as fs } from "fs";
import { dirname, resolve } from "path";
import { DEFAULT_FILE_TEMPLATE } from "../defaults";
import type { ComviConfig, GeneratorOptions } from "../types";
import { TypegenError, ErrorCodes } from "../utils/errors";
import { atomicWriteFile } from "../utils/atomicWrite";
import { isHttpUrl } from "./apiBaseUrl";
import { timeoutsFromEnv } from "./timeouts";
import { isModuleSpecifier } from "@comvi/typegen";

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The JSON type a config value actually has, for an error the reader can act
 * on: `null` and an array are both `typeof "object"`, and saying so would not
 * explain what is wrong with the line they wrote.
 */
function typeNameOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * The type and the value, for a reader looking at the line they wrote — except
 * for `null`, whose type name already *is* its value, so naming both read
 * "received null null".
 */
function describe(value: unknown): string {
  return value === null ? "null" : `${typeNameOf(value)} ${JSON.stringify(value)}`;
}

/** Every top-level field `ComviConfig` declares. */
const KNOWN_CONFIG_FIELDS: ReadonlySet<string> = new Set<keyof ComviConfig>([
  "apiKey",
  "apiBaseUrl",
  "outputPath",
  "strictParams",
  "augment",
  "translationsPath",
  "fileTemplate",
  "format",
  "namespaces",
  "locales",
  "push",
  "pull",
]);

/** Every field the `push` and `pull` sections declare. */
const KNOWN_SECTION_FIELDS: Readonly<Record<"push" | "pull", ReadonlySet<string>>> = {
  push: new Set(["forceMode"]),
  pull: new Set(["emptyDir"]),
};

const FORCE_MODES: readonly string[] = ["override", "keep", "ask", "abort"];

/** What to write instead, for the fields people are likely to carry over. */
const UNKNOWN_FIELD_HINTS: Record<string, string> = {
  languages: 'use "locales"',
  defaultNsName: "the default namespace is read from the TMS, so delete it",
};

export class ConfigLoader {
  private static readonly CONFIG_FILENAME = ".comvirc.json";

  /**
   * Find the nearest `.comvirc.json` by walking up from `startDir`.
   *
   * Stops at:
   * - the directory that contains the file (success);
   * - the directory that contains `package.json` (project root — bound the walk);
   * - the filesystem root (no config in this project tree).
   *
   * The project-root bound is the rule `EnvLoader` already applies to `.env`:
   * do NOT cross into the parent of the project (CI shared dirs, $HOME), where
   * an unrelated `.comvirc.json` would be adopted along with its `apiKey`.
   */
  private static async findConfigFile(startDir: string = process.cwd()): Promise<string | null> {
    let dir = resolve(startDir);

    for (;;) {
      const configPath = resolve(dir, this.CONFIG_FILENAME);
      if (await fileExists(configPath)) return configPath;

      // `package.json` is the same project-root marker `EnvLoader` bounds its
      // `.env` walk with. Inline, not a module constant: a module-level
      // initializer is evaluated once, before a mutation run can switch it, so
      // `pnpm mutation` cannot see the claim this line makes.
      if (await fileExists(resolve(dir, "package.json"))) return null;

      const parent = dirname(dir);
      if (parent === dir) return null; // filesystem root
      dir = parent;
    }
  }

  static async load(configPath?: string): Promise<ComviConfig> {
    let filePath: string | null;

    if (configPath) {
      filePath = resolve(configPath);
      try {
        await fs.access(filePath);
      } catch {
        throw new TypegenError(`Config file not found: ${filePath}`, ErrorCodes.CONFIG_NOT_FOUND);
      }
    } else {
      filePath = await this.findConfigFile();
      if (!filePath) {
        throw new TypegenError(
          `No ${this.CONFIG_FILENAME} found. Run 'comvi init' to create one.`,
          ErrorCodes.CONFIG_NOT_FOUND,
        );
      }
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: unknown = JSON.parse(content);

      // Valid JSON is not yet a config: `null` or `[]` would reach
      // `Object.keys` and the env overrides as a raw TypeError (exit 1).
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new TypegenError(
          `Invalid configuration in ${filePath}: expected a JSON object, received ${typeNameOf(parsed)}`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
      const config = parsed as ComviConfig;

      this.rejectUnknownFields(config);

      // An empty string means "not set", as it did when the commands fell back
      // to the default with `||`.
      if (config.apiBaseUrl === "") {
        delete config.apiBaseUrl;
      }

      this.applyEnvironmentOverrides(config);

      this.validateConfig(config);

      return config;
    } catch (error) {
      if (error instanceof TypegenError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new TypegenError(
          `Invalid JSON in ${filePath}: ${error.message}`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
      throw error;
    }
  }

  /** Lets sensitive values such as the API key stay out of version control. */
  private static applyEnvironmentOverrides(config: ComviConfig): void {
    if (process.env.COMVI_API_KEY) {
      config.apiKey = process.env.COMVI_API_KEY;
    }

    if (process.env.COMVI_API_BASE_URL) {
      config.apiBaseUrl = process.env.COMVI_API_BASE_URL;
    }
  }

  private static validateConfig(config: ComviConfig): void {
    const errors: string[] = [];

    // apiKey is required, but can come from env var (already applied in applyEnvironmentOverrides)
    if (!config.apiKey || typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
      errors.push("apiKey is required");
      errors.push("  Set COMVI_API_KEY environment variable or add to .comvirc.json");
    }

    if (errors.length > 0) {
      throw new TypegenError(
        `Invalid configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    this.validateScalarFields(config);

    this.validateSwitches(config);

    // Filter fields: namespaces / locales.
    // Validation throws CONFIG_INVALID so the CLI maps it to exit code 4.
    config.namespaces = this.normalizeFilterField(config.namespaces, "namespaces");
    config.locales = this.normalizeFilterField(config.locales, "locales");

    // `augment` is interpolated into the generated `declare module`: a
    // non-string, or one holding a quote or line break, would produce a file
    // TypeScript cannot parse or one with injected declarations.
    if (config.augment !== undefined) {
      this.assertOptionalNonEmptyString(config.augment, "augment");
      config.augment = config.augment.trim();
      if (!isModuleSpecifier(config.augment)) {
        throw new TypegenError(
          `Invalid configuration: "augment" must be a module specifier (letters, digits and @ # . / : ~ + - _), received ${JSON.stringify(config.augment)}`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
    }
  }

  /**
   * The value of every known scalar field, checked before any command sends a
   * request or touches the filesystem. TypeScript's types do not protect a
   * hand-edited JSON file: `format: "yaml"` made `pull` write `en.yaml` beside
   * `admin/en.json`, which the next read — filtering for `.yaml` — saw only
   * half of, and `translationsPath: 42` failed later as a raw `TypeError`.
   */
  private static validateScalarFields(config: ComviConfig): void {
    for (const key of ["outputPath", "translationsPath", "fileTemplate"] as const) {
      this.assertOptionalNonEmptyString(config[key], key);
    }

    if (config.format !== undefined && config.format !== "json") {
      throw new TypegenError(
        `Invalid configuration: "format" must be "json", the only supported format, received ${describe(config.format)}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    this.assertOptionalNonEmptyString(config.apiBaseUrl, "apiBaseUrl");
    if (config.apiBaseUrl !== undefined && !isHttpUrl(config.apiBaseUrl)) {
      throw new TypegenError(
        `Invalid configuration: "apiBaseUrl"${process.env.COMVI_API_BASE_URL ? " (from COMVI_API_BASE_URL)" : ""} must be an http(s) URL, received ${describe(config.apiBaseUrl)}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    this.validateFileTemplate(config.fileTemplate);
  }

  /**
   * The template decides where every namespace and locale lives and which files
   * the reader picks back up. One that lacks a placeholder maps several
   * catalogs onto one file; one that does not end in `.json` is written but
   * never read, so a later push sees an empty catalog.
   */
  private static validateFileTemplate(template: string | undefined): void {
    if (template === undefined) return;

    const count = (placeholder: string) => template.split(placeholder).length - 1;
    const endsInJson = template.endsWith(".json") || template.endsWith(".{extension}");
    if (count("{languageTag}") !== 1 || count("{namespace}") !== 1 || !endsInJson) {
      throw new TypegenError(
        `Invalid configuration: "fileTemplate" must contain exactly one {languageTag} and one {namespace} and end in ".json" (or ".{extension}"), received ${describe(template)}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }
  }

  private static assertOptionalNonEmptyString(value: unknown, key: string): void {
    if (value === undefined || (typeof value === "string" && value.trim() !== "")) {
      return;
    }

    throw new TypegenError(
      `Invalid configuration: "${key}" must be a non-empty string, received ${describe(value)}`,
      ErrorCodes.CONFIG_INVALID,
    );
  }

  /**
   * Every boolean switch in the config, and the two sections that hold them.
   *
   * A JSON string is truthy, so `"emptyDir": "false"` used to read as "yes,
   * clear the directory" — the option that deletes the local catalog, set to
   * the exact opposite of what the file says. The same mistake in
   * `strictParams` silently turned strict parameters back on. Both are
   * refused during `load`, which runs before any command opens a socket or
   * touches the translations directory.
   *
   * `push.forceMode` is the other destructive switch, checked here against
   * the four modes so a typo fails before any command runs.
   */
  private static validateSwitches(config: ComviConfig): void {
    this.assertOptionalBoolean(config.strictParams, "strictParams");

    const pull = this.assertOptionalSection(config.pull, "pull");
    this.assertOptionalBoolean(pull?.emptyDir, "pull.emptyDir");

    const push = this.assertOptionalSection(config.push, "push");
    const forceMode = push?.forceMode;
    if (forceMode !== undefined && !FORCE_MODES.includes(forceMode as string)) {
      throw new TypegenError(
        `Invalid configuration: "push.forceMode" must be one of ${FORCE_MODES.map((mode) => `"${mode}"`).join(", ")}, received ${describe(forceMode)}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }
  }

  private static assertOptionalBoolean(value: unknown, key: string): void {
    if (value === undefined || typeof value === "boolean") {
      return;
    }

    throw new TypegenError(
      `Invalid configuration: "${key}" must be a boolean (true or false), received ${describe(value)}`,
      ErrorCodes.CONFIG_INVALID,
    );
  }

  private static assertOptionalSection(
    value: unknown,
    key: string,
  ): Record<string, unknown> | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypegenError(
        `Invalid configuration: "${key}" must be an object, received ${typeNameOf(value)}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    return value as Record<string, unknown>;
  }

  /**
   * Normalize and validate an optional string-array filter from config.
   *
   * - undefined → undefined (field omitted, "all" semantics)
   * - non-array, non-string items, blank items → CONFIG_INVALID
   * - empty array → CONFIG_INVALID with "remove the field" hint
   * - duplicates after trimming → CONFIG_INVALID
   * - otherwise: returns trimmed array
   */
  private static normalizeFilterField(
    value: unknown,
    fieldName: "namespaces" | "locales",
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new TypegenError(
        `Invalid configuration: "${fieldName}" must be an array of strings`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    if (value.length === 0) {
      throw new TypegenError(
        `Invalid configuration: "${fieldName}" is an empty list — remove the field to operate on all ${fieldName}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    const trimmed: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") {
        throw new TypegenError(
          `Invalid configuration: "${fieldName}" must contain only strings`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
      const t = item.trim();
      if (t === "") {
        throw new TypegenError(
          `Invalid configuration: "${fieldName}" contains an empty string`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
      trimmed.push(t);
    }

    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const item of trimmed) {
      if (seen.has(item)) {
        duplicates.push(item);
      }
      seen.add(item);
    }
    if (duplicates.length > 0) {
      throw new TypegenError(
        `Invalid configuration: "${fieldName}" contains duplicate values: ${[...new Set(duplicates)].join(", ")}`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    return trimmed;
  }

  /** Only valid after validation, which is what guarantees `apiKey` is set. */
  static toGeneratorOptions(config: ComviConfig): GeneratorOptions {
    if (!config.apiKey) {
      throw new TypegenError(
        "API key is required. Set COMVI_API_KEY environment variable.",
        ErrorCodes.CONFIG_INVALID,
      );
    }

    return {
      apiKey: config.apiKey,
      apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
      outputPath: config.outputPath || "src/types/i18n.d.ts",
      strictParams: config.strictParams ?? true,
      augment: config.augment,
      ...timeoutsFromEnv(),
    };
  }

  /**
   * A `.comvirc.json` is hand-edited JSON the type checker never sees, so a
   * field the config does not have fails here, by name, instead of being
   * ignored. Where a field has a current equivalent, the message names it.
   */
  private static rejectUnknownFields(config: ComviConfig): void {
    for (const key of Object.keys(config)) {
      if (KNOWN_CONFIG_FIELDS.has(key)) continue;
      const instead = UNKNOWN_FIELD_HINTS[key];
      throw new TypegenError(
        `".comvirc.json" field "${key}" is not an option${instead ? `: ${instead}` : ""}.`,
        ErrorCodes.CONFIG_INVALID,
      );
    }

    // A section that is not an object is reported by `validateSwitches`.
    for (const section of ["push", "pull"] as const) {
      const value: unknown = config[section];
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
      for (const key of Object.keys(value)) {
        if (KNOWN_SECTION_FIELDS[section].has(key)) continue;
        throw new TypegenError(
          `".comvirc.json" field "${section}.${key}" is not an option.`,
          ErrorCodes.CONFIG_INVALID,
        );
      }
    }
  }

  /** Where `create()` writes when the caller gives no explicit output path. */
  static defaultConfigPath(): string {
    return resolve(process.cwd(), this.CONFIG_FILENAME);
  }

  /** `apiKey` belongs in COMVI_API_KEY, not in the written config file. */
  static async create(config: Partial<ComviConfig>, outputPath?: string): Promise<string> {
    const filePath = outputPath || this.defaultConfigPath();

    // Build config object - apiKey is NOT included by default (use env var instead).
    // namespaces/locales are persisted only when set so init doesn't bake an
    // empty filter into a fresh config (treat undefined as "all").
    const configToWrite: Record<string, unknown> = {
      // Only include apiKey if explicitly provided (not recommended for security)
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
      outputPath: config.outputPath || "src/types/i18n.d.ts",
      strictParams: config.strictParams ?? true,
      translationsPath: config.translationsPath || "./src/locales",
      fileTemplate: config.fileTemplate || DEFAULT_FILE_TEMPLATE,
      format: config.format || "json",
      ...(config.namespaces !== undefined ? { namespaces: config.namespaces } : {}),
      ...(config.locales !== undefined ? { locales: config.locales } : {}),
      push: {
        forceMode: config.push?.forceMode || "ask",
      },
      pull: {
        emptyDir: config.pull?.emptyDir || false,
      },
    };

    const content = JSON.stringify(configToWrite, null, 2);

    try {
      // Always temp + rename: `init --force` replaces an existing config, and
      // a plain write truncates it first, so a failure halfway would destroy
      // the old file. With a secret, the new file is also 0600 from its first
      // byte, so an existing permissive config never briefly exposes the key.
      await atomicWriteFile(filePath, content, config.apiKey ? { mode: 0o600 } : {});
      return filePath;
    } catch (error) {
      if (error instanceof Error) {
        throw new TypegenError(
          `Failed to create config file: ${error.message}`,
          ErrorCodes.CONFIG_WRITE_FAILED,
          error,
        );
      }
      throw error;
    }
  }
}
