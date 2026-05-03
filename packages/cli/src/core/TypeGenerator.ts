/**
 * TypeGenerator - Main orchestrator for type generation
 *
 * Simplified flow:
 * 1. Fetch schema from backend (GET /v1/project, then /v1/projects/:projectId/schema)
 * 2. Convert schema to .d.ts using TypeEmitter
 * 3. Write to file
 */

import { ApiClient } from "./ApiClient";
import { TypeEmitter } from "./TypeEmitter";
import { FileSystemWriter } from "./FileSystemWriter";
import { ConsoleReporter, type GenerationReporter } from "./GenerationReporter";
import type { GeneratorOptions, GenerationResult, ProjectSchema, CheckResult } from "../types";
import { TypegenError } from "../utils/errors";
import { createLogger, type Logger } from "../utils/logger";

export class TypeGenerator {
  private apiClient: ApiClient;
  private typeEmitter: TypeEmitter;
  private writer: FileSystemWriter;
  private reporter: GenerationReporter;
  private options: GeneratorOptions;
  private logger: Logger;

  constructor(
    options: GeneratorOptions,
    dependencies?: {
      writer?: FileSystemWriter;
      reporter?: GenerationReporter;
      logger?: Logger;
    },
  ) {
    this.options = {
      strictParams: true,
      ...options,
    };

    // Initialize logger
    this.logger = dependencies?.logger ?? createLogger();

    // Initialize API client
    this.apiClient = new ApiClient({
      apiKey: this.options.apiKey,
      apiBaseUrl: this.options.apiBaseUrl,
    });

    // Initialize type emitter
    this.typeEmitter = new TypeEmitter();

    // Initialize file writer (injectable for testing)
    this.writer = dependencies?.writer ?? new FileSystemWriter();

    // Initialize reporter (injectable for testing/customization)
    this.reporter = dependencies?.reporter ?? new ConsoleReporter(this.logger);
  }

  /**
   * Validate connection to the TMS API
   */
  async validateConnection(): Promise<boolean> {
    try {
      return await this.apiClient.validateConnection();
    } catch (error) {
      this.logger.error("Connection validation failed", error);
      return false;
    }
  }

  /**
   * Generate TypeScript types from the TMS
   */
  async generate(): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      this.reporter.reportStart();

      // Fetch schema from TMS
      this.reporter.reportFetching();
      const schema = await this.apiClient.fetchSchema();

      // Generate and write types
      return await this.generateFromSchema(schema, startTime);
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof TypegenError) {
        this.reporter.reportError(error);
        return {
          success: false,
          error: error.message,
          duration,
        };
      }

      if (error instanceof Error) {
        this.reporter.reportError(error);
        return {
          success: false,
          error: error.message,
          duration,
        };
      }

      return {
        success: false,
        error: "Unknown error occurred",
        duration,
      };
    }
  }

  /**
   * Check if types are up to date (CI mode)
   */
  async check(): Promise<CheckResult> {
    try {
      // Fetch schema from TMS
      const schema = await this.apiClient.fetchSchema();
      const keyCount = Object.keys(schema.keys).length;

      // Generate expected types
      const expectedTypes = this.typeEmitter.generate(schema, {
        strictParams: this.options.strictParams,
        defaultNsName: this.options.defaultNsName,
      });

      // Read current types file
      let currentTypes: string | null = null;
      let currentKeyCount = 0;

      try {
        currentTypes = await this.writer.read(this.options.outputPath);
        // Count keys in current file (simple heuristic: count lines with type definitions)
        const keyMatches = currentTypes.match(/^\s+'[^']+':.*$/gm);
        currentKeyCount = keyMatches?.length ?? 0;
      } catch {
        // File doesn't exist
        return {
          upToDate: false,
          keysGenerated: keyCount,
          currentKeys: 0,
          filePath: this.options.outputPath,
        };
      }

      // Compare (normalize whitespace for comparison)
      const normalizeContent = (content: string) =>
        content.replace(/Generated at:.*$/gm, "").trim();

      const upToDate = normalizeContent(currentTypes) === normalizeContent(expectedTypes);

      return {
        upToDate,
        keysGenerated: keyCount,
        currentKeys: currentKeyCount,
        filePath: this.options.outputPath,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Unknown error occurred");
    }
  }

  /**
   * Generate types from an already-fetched schema
   * Used by SSE handler to avoid re-fetching
   */
  async generateFromSchema(
    schema: ProjectSchema,
    startTime: number = Date.now(),
  ): Promise<GenerationResult> {
    try {
      const keyCount = Object.keys(schema.keys).length;

      // Generate TypeScript declarations
      this.reporter.reportGenerating();
      const typeDeclarations = this.typeEmitter.generate(schema, {
        strictParams: this.options.strictParams,
        defaultNsName: this.options.defaultNsName,
      });

      // Write to file
      await this.writer.write(this.options.outputPath, typeDeclarations);

      const duration = Date.now() - startTime;

      this.reporter.reportSuccess({
        keysGenerated: keyCount,
        duration,
        filePath: this.options.outputPath,
      });

      return {
        success: true,
        filePath: this.options.outputPath,
        keysGenerated: keyCount,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof Error) {
        this.reporter.reportError(error);
        return {
          success: false,
          error: error.message,
          duration,
        };
      }

      return {
        success: false,
        error: "Unknown error occurred",
        duration,
      };
    }
  }

  /**
   * Get the API client for SSE subscription
   */
  getApiClient(): ApiClient {
    return this.apiClient;
  }
}
