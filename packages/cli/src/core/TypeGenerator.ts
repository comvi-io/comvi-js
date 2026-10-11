import { countKeyLines, normalizeGenerated } from "@comvi/typegen";
import { ApiClient } from "./ApiClient";
import { cliAugmentationTarget, emitCliDeclarations } from "./TypeEmitter";
import { FileSystemWriter } from "./FileSystemWriter";
import { ConsoleReporter, type GenerationReporter } from "./GenerationReporter";
import type { GeneratorOptions, GenerationResult, ProjectSchema, CheckResult } from "../types";
import { TypegenError } from "../utils/errors";
import { createLogger, type Logger } from "../utils/logger";

export class TypeGenerator {
  private apiClient: ApiClient;
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

      // The same question the write path asks, answered from the same
      // manifest: a check that guessed a different target would report drift
      // no regeneration could clear.
      const expectedTypes = emitCliDeclarations(schema, {
        strictParams: this.options.strictParams,
        defaultNsName,
        augment: cliAugmentationTarget(this.options.augment),
      });

      let currentTypes: string | null = null;
      let currentKeyCount = 0;

      try {
        currentTypes = await this.writer.read(this.options.outputPath);
        currentKeyCount = countKeyLines(currentTypes);
      } catch {
        // File doesn't exist
        return {
          upToDate: false,
          keysGenerated: keyCount,
          currentKeys: 0,
          filePath: this.options.outputPath,
        };
      }

      // A file written by @comvi/cli 0.4 carries a `Generated at:` line that
      // this CLI no longer emits; normalizing drops it from both sides, so an
      // upgrade does not report every existing repo as stale.
      const upToDate = normalizeGenerated(currentTypes) === normalizeGenerated(expectedTypes);

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

      // Resolved before the write: a project that declares no Comvi package
      // has no module the declarations could augment, and a file that augments
      // an unresolvable one is silently inert — TypeScript reports TS2882 on
      // the generated import and `skipLibCheck: true` hides even that.
      const augment = cliAugmentationTarget(this.options.augment);

      const typeDeclarations = emitCliDeclarations(schema, {
        strictParams: this.options.strictParams,
        defaultNsName: resolvedDefaultNsName,
        augment,
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
