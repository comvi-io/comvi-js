/**
 * Generate Types command - Generate TypeScript types from TMS
 *
 * Usage:
 *   comvi typegen                     # One-time generation (preferred name)
 *   comvi typegen --watch             # Real-time updates via SSE
 *   comvi typegen --check             # CI mode: check if types are up to date
 *
 * Aliases:
 *   comvi generate-types              # Original verbose name
 *   comvi generate                    # Short legacy alias (one-time only)
 */

import { Command } from "commander";
import { TypeGenerator } from "../core/TypeGenerator";
import { ConfigLoader } from "../core/ConfigLoader";

export function createGenerateTypesCommand(): Command {
  return new Command("generate-types")
    .description("Generate TypeScript types from TMS")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-w, --watch", "Watch for changes via SSE and regenerate types")
    .option("--check", "CI mode: check if types are up to date (exit 1 if outdated)")
    .action(async (options) => {
      try {
        console.log("🔄 Loading configuration...");

        // Load configuration
        const config = await ConfigLoader.load(options.config);
        const generatorOptions = ConfigLoader.toGeneratorOptions(config);

        // Create generator
        const generator = new TypeGenerator(generatorOptions);

        if (options.check) {
          // CI mode: check if types are up to date
          await runCheckMode(generator);
        } else if (options.watch) {
          // Watch mode: subscribe to SSE updates
          await runWatchMode(generator);
        } else {
          // One-time generation
          await runGenerateOnce(generator);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Error: ${error.message}`);
        }
        process.exit(1);
      }
    });
}

/**
 * 'typegen' alias for 'generate-types' — short, canonical name used by the docs.
 * Mirrors the full feature set (--watch, --check) so every documented invocation
 * works regardless of which name the user types.
 */
export function createTypegenCommand(): Command {
  return new Command("typegen")
    .description("Generate TypeScript types from TMS (alias for generate-types)")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-w, --watch", "Watch for changes via SSE and regenerate types")
    .option("--check", "CI mode: check if types are up to date (exit 1 if outdated)")
    .action(async (options) => {
      try {
        console.log("🔄 Loading configuration...");

        const config = await ConfigLoader.load(options.config);
        const generatorOptions = ConfigLoader.toGeneratorOptions(config);
        const generator = new TypeGenerator(generatorOptions);

        if (options.check) {
          await runCheckMode(generator);
        } else if (options.watch) {
          await runWatchMode(generator);
        } else {
          await runGenerateOnce(generator);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Error: ${error.message}`);
        }
        process.exit(1);
      }
    });
}

/**
 * Backward compatibility: 'generate' command that aliases to 'generate-types'
 */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate TypeScript types from TMS (alias for generate-types)")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .action(async (options) => {
      try {
        console.log("🔄 Loading configuration...");

        // Load configuration
        const config = await ConfigLoader.load(options.config);
        const generatorOptions = ConfigLoader.toGeneratorOptions(config);

        // Create generator
        const generator = new TypeGenerator(generatorOptions);

        // One-time generation
        await runGenerateOnce(generator);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Error: ${error.message}`);
        }
        process.exit(1);
      }
    });
}

/**
 * Run one-time type generation
 */
async function runGenerateOnce(generator: TypeGenerator): Promise<void> {
  console.log("🔄 Fetching schema from TMS...");
  const result = await generator.generate();

  if (result.success) {
    console.log(`✓ Generated ${result.keysGenerated} keys → ${result.filePath}`);
    process.exit(0);
  } else {
    console.error(`✗ Generation failed: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Run watch mode with SSE subscription
 */
async function runWatchMode(generator: TypeGenerator): Promise<void> {
  // Initial generation
  console.log("🔄 Fetching initial schema from TMS...");
  const result = await generator.generate();

  if (!result.success) {
    console.error(`✗ Initial generation failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`✓ Generated ${result.keysGenerated} keys → ${result.filePath}`);

  // Subscribe to SSE updates
  console.log("\n👀 Subscribing to real-time updates...");

  const apiClient = generator.getApiClient();

  const cleanup = await apiClient.subscribeToSchemaUpdates(async (schema) => {
    console.log("\n🔄 Received schema update via SSE...");
    const updateResult = await generator.generateFromSchema(schema);

    if (updateResult.success) {
      console.log(`✓ Updated ${updateResult.keysGenerated} keys → ${updateResult.filePath}`);
    } else {
      console.error(`⚠  Update failed: ${updateResult.error}`);
    }
  });

  console.log("✓ Watching for changes...");
  console.log("Press Ctrl+C to stop\n");

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Closing SSE connection...");
    cleanup();
    console.log("✓ Stopped watching");
    process.exit(0);
  });

  // Keep process alive
  process.stdin.resume();
}

/**
 * Run check mode for CI
 */
async function runCheckMode(generator: TypeGenerator): Promise<void> {
  console.log("🔄 Checking if types are up to date...");

  const result = await generator.check();

  if (result.upToDate) {
    console.log(`✓ Types are up to date (${result.keysGenerated} keys)`);
    process.exit(0);
  } else {
    console.error(`✗ Types are outdated!`);
    console.error(`  Current: ${result.currentKeys ?? 0} keys`);
    console.error(`  Expected: ${result.keysGenerated} keys`);
    console.error("\n  Run 'comvi typegen' to update.");
    process.exit(1);
  }
}
