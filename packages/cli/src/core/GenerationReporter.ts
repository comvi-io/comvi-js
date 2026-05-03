/**
 * GenerationReporter - Handles reporting and statistics for type generation
 *
 * This abstraction separates reporting concerns from the core generation logic,
 * making TypeGenerator cleaner and the reporting behavior testable and customizable.
 */

import type { Logger } from "../utils/logger";
import { createLogger } from "../utils/logger";

/**
 * Statistics about a generation run
 */
export interface GenerationStats {
  keysGenerated: number;
  duration: number;
  filePath: string;
}

/**
 * Reporter interface for dependency injection
 */
export interface GenerationReporter {
  reportStart(): void;
  reportFetching(): void;
  reportGenerating(): void;
  reportSuccess(stats: GenerationStats): void;
  reportError(error: Error): void;
  reportWarning(message: string): void;
}

/**
 * Console-based reporter implementation
 */
export class ConsoleReporter implements GenerationReporter {
  constructor(private logger: Logger = createLogger()) {}

  reportStart(): void {
    this.logger.debug("Starting type generation");
  }

  reportFetching(): void {
    this.logger.info("Fetching translations from TMS...");
  }

  reportGenerating(): void {
    this.logger.info("Generating TypeScript declarations...");
  }

  reportSuccess(stats: GenerationStats): void {
    this.logger.info(`✓ Generated ${stats.keysGenerated} type definitions in ${stats.duration}ms`);
    this.logger.info(`✓ Output: ${stats.filePath}`);
  }

  reportError(error: Error): void {
    this.logger.error(`Generation failed: ${error.message}`);
  }

  reportWarning(message: string): void {
    this.logger.warn(message);
  }
}

/**
 * Silent reporter for testing or silent mode
 */
export class SilentReporter implements GenerationReporter {
  reportStart(): void {}
  reportFetching(): void {}
  reportGenerating(): void {}
  reportSuccess(): void {}
  reportError(): void {}
  reportWarning(): void {}
}

/**
 * Collecting reporter for testing - stores all reports
 */
export class CollectingReporter implements GenerationReporter {
  public reports: Array<{
    type: "start" | "fetching" | "generating" | "success" | "error" | "warning";
    data?: unknown;
  }> = [];

  reportStart(): void {
    this.reports.push({ type: "start" });
  }

  reportFetching(): void {
    this.reports.push({ type: "fetching" });
  }

  reportGenerating(): void {
    this.reports.push({ type: "generating" });
  }

  reportSuccess(stats: GenerationStats): void {
    this.reports.push({ type: "success", data: stats });
  }

  reportError(error: Error): void {
    this.reports.push({ type: "error", data: error });
  }

  reportWarning(message: string): void {
    this.reports.push({ type: "warning", data: message });
  }

  /**
   * Get all reports of a specific type
   */
  getReports(type: string): unknown[] {
    return this.reports.filter((r) => r.type === type).map((r) => r.data);
  }

  /**
   * Clear all collected reports
   */
  clear(): void {
    this.reports = [];
  }
}
