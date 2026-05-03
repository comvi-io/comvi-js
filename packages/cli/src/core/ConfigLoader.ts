/**
 * ConfigLoader - Load and validate .comvirc.json configuration
 *
 * Configuration structure:
 * - apiKey: API key for TMS (project determined by key)
 * - apiBaseUrl: Base URL for TMS API
 * - outputPath: Output path for .d.ts file
 * - strictParams: Whether params are required
 * - translationsPath: Local translations folder
 * - fileTemplate: File template pattern
 * - push/pull: Command-specific options
 */

import { promises as fs } from "fs";
import { resolve } from "path";
import type { ComviConfig, GeneratorOptions } from "../types";
import { TypegenError, ErrorCodes } from "../utils/errors";

export class ConfigLoader {
  private static readonly CONFIG_FILENAME = ".comvirc.json";

  /**
   * Find the config file by searching up the directory tree
   */
  private static async findConfigFile(startDir: string = process.cwd()): Promise<string | null> {
    let currentDir = resolve(startDir);
    const root = resolve("/");

    while (currentDir !== root) {
      const configPath = resolve(currentDir, this.CONFIG_FILENAME);

      try {
        await fs.access(configPath);
        return configPath;
      } catch {
        // File doesn't exist, go up one directory
        currentDir = resolve(currentDir, "..");
      }
    }

    // Check root directory
    const rootConfigPath = resolve(root, this.CONFIG_FILENAME);
    try {
      await fs.access(rootConfigPath);
      return rootConfigPath;
    } catch {
      return null;
    }
  }

  /**
   * Load configuration from .comvirc.json with environment variable overrides
   */
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
      const config = JSON.parse(content) as ComviConfig;

      // Apply environment variable overrides
      this.applyEnvironmentOverrides(config);

      // Validate required fields
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

  /**
   * Apply environment variable overrides to config
   * This allows sensitive values like API keys to be kept out of version control
   */
  private static applyEnvironmentOverrides(config: ComviConfig): void {
    // API key can be overridden by environment variable
    if (process.env.COMVI_API_KEY) {
      config.apiKey = process.env.COMVI_API_KEY;
    }

    // API base URL can also be overridden
    if (process.env.COMVI_API_BASE_URL) {
      config.apiBaseUrl = process.env.COMVI_API_BASE_URL;
    }
  }

  /**
   * Validate configuration
   * Note: apiKey can come from environment variable COMVI_API_KEY
   */
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
  }

  /**
   * Convert ComviConfig to GeneratorOptions
   * Note: This should only be called after config is validated (apiKey guaranteed to be set)
   */
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
      defaultNsName: config.defaultNsName ?? "default",
    };
  }

  /**
   * Create a new config file
   * Note: apiKey should be set via COMVI_API_KEY environment variable, not in config file
   */
  static async create(config: Partial<ComviConfig>, outputPath?: string): Promise<string> {
    const filePath = outputPath || resolve(process.cwd(), this.CONFIG_FILENAME);

    // Build config object - apiKey is NOT included by default (use env var instead)
    const configToWrite: Record<string, unknown> = {
      // Only include apiKey if explicitly provided (not recommended for security)
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
      outputPath: config.outputPath || "src/types/i18n.d.ts",
      strictParams: config.strictParams ?? true,
      defaultNsName: config.defaultNsName ?? "default",
      translationsPath: config.translationsPath || "./src/locales",
      fileTemplate: config.fileTemplate || "{languageTag}/{namespace}.json",
      format: config.format || "json",
      push: {
        forceMode: config.push?.forceMode || "ask",
      },
      pull: {
        emptyDir: config.pull?.emptyDir || false,
      },
    };

    const content = JSON.stringify(configToWrite, null, 2);

    try {
      await fs.writeFile(filePath, content, "utf-8");
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
