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
  private defaultNsName?: string;
  private defaultNsNamePromise?: Promise<string>;

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

    this.logger = dependencies?.logger ?? createLogger();

    this.apiClient = new ApiClient({
      apiKey: this.options.apiKey,
      apiBaseUrl: this.options.apiBaseUrl,
    });

    this.typeEmitter = new TypeEmitter();

    this.writer = dependencies?.writer ?? new FileSystemWriter();

    this.reporter = dependencies?.reporter ?? new ConsoleReporter(this.logger);
  }

  async validateConnection(): Promise<boolean> {
    try {
      return await this.apiClient.validateConnection();
    } catch (error) {
      this.logger.error("Connection validation failed", error);
      return false;
    }
  }

  async generate(): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      this.reporter.reportStart();

      this.reporter.reportFetching();
      const [schema, defaultNsName] = await Promise.all([
        this.apiClient.fetchSchema(),
        this.getDefaultNamespaceName(),
      ]);

      return await this.generateFromSchema(schema, startTime, defaultNsName);
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

  /** CI mode: compares the file on disk against freshly generated output. */
  async check(): Promise<CheckResult> {
    try {
      const [schema, defaultNsName] = await Promise.all([
        this.apiClient.fetchSchema(),
        this.getDefaultNamespaceName(),
      ]);
      const keyCount = Object.keys(schema.keys).length;

      const expectedTypes = this.typeEmitter.generate(schema, {
        strictParams: this.options.strictParams,
        defaultNsName,
      });

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

  /** Used by the SSE handler, which already holds the schema. */
  async generateFromSchema(
    schema: ProjectSchema,
    startTime: number = Date.now(),
    defaultNsName?: string,
  ): Promise<GenerationResult> {
    try {
      const keyCount = Object.keys(schema.keys).length;
      const resolvedDefaultNsName = defaultNsName ?? (await this.getDefaultNamespaceName());

      this.reporter.reportGenerating();
      const typeDeclarations = this.typeEmitter.generate(schema, {
        strictParams: this.options.strictParams,
        defaultNsName: resolvedDefaultNsName,
      });

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

  /** Exposed so the watch command can open an SSE subscription. */
  getApiClient(): ApiClient {
    return this.apiClient;
  }

  private async getDefaultNamespaceName(): Promise<string> {
    if (this.defaultNsName) {
      return this.defaultNsName;
    }

    this.defaultNsNamePromise ??= this.apiClient.fetchDefaultNamespace().then(
      (namespace) => {
        this.defaultNsName = namespace;
        this.defaultNsNamePromise = undefined;
        return namespace;
      },
      (error: unknown) => {
        this.defaultNsNamePromise = undefined;
        throw error;
      },
    );

    return this.defaultNsNamePromise;
  }
}
