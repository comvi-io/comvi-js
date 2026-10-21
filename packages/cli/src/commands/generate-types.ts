import { Command } from "commander";
import { TypeGenerator } from "../core/TypeGenerator";
import { SilentReporter } from "../core/GenerationReporter";
import { ConfigLoader } from "../core/ConfigLoader";
import { ErrorCodes, EXIT_VALIDATION, isTypegenError, type TypegenError } from "../utils/errors";
import type { CheckResult } from "../types";

/** `--check` reached no verdict because the TMS request failed. */
const EXIT_CHECK_FAILED = 2;
/** Errors that mean the check never got to compare anything. */
const CHECK_BLOCKING_CODES: readonly string[] = [
  ErrorCodes.API_CONNECTION_FAILED,
  ErrorCodes.API_AUTH_FAILED,
  ErrorCodes.API_FETCH_FAILED,
  ErrorCodes.API_TIMEOUT,
  ErrorCodes.API_INVALID_RESPONSE,
  // A declaration file that exists but cannot be read: no verdict either.
  ErrorCodes.FS_READ_FAILED,
];

const CHECK_DESCRIPTION =
  "CI mode: verify the generated types are up to date " +
  "(exit 1 = outdated, 2 = check could not run, 4 = invalid config or a schema that cannot be emitted)";

export function createTypegenCommand(): Command {
  return new Command("typegen")
    .description("Generate TypeScript types from TMS")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-w, --watch", "Watch for changes via SSE and regenerate types")
    .option("--check", CHECK_DESCRIPTION)
    .action(async (options) => {
      try {
        console.log("🔄 Loading configuration...");

        const config = await ConfigLoader.load(options.config);
        const generatorOptions = ConfigLoader.toGeneratorOptions(config);

        // The command narrates every step and failure itself; a reporter would
        // print each of them a second time.
        const generator = new TypeGenerator(generatorOptions, { reporter: new SilentReporter() });

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
        process.exit(exitCodeFor(error));
      }
    });
}

function exitCodeFor(error: unknown): number {
  if (
    isTypegenError(error, ErrorCodes.VALIDATION_FAILED) ||
    isTypegenError(error, ErrorCodes.CONFIG_INVALID)
  ) {
    return EXIT_VALIDATION;
  }
  return 1;
}

function isCheckBlocked(error: unknown): error is TypegenError {
  return CHECK_BLOCKING_CODES.some((code) => isTypegenError(error, code));
}

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

async function runWatchMode(generator: TypeGenerator): Promise<void> {
  console.log("🔄 Fetching initial schema from TMS...");
  const result = await generator.generate();

  if (!result.success) {
    console.error(`✗ Initial generation failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`✓ Generated ${result.keysGenerated} keys → ${result.filePath}`);

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

  process.on("SIGINT", () => {
    console.log("\n\n🛑 Closing SSE connection...");
    cleanup();
    console.log("✓ Stopped watching");
    process.exit(0);
  });

  // Keep process alive
  process.stdin.resume();
}

async function runCheckMode(generator: TypeGenerator): Promise<void> {
  console.log("🔄 Checking if types are up to date...");

  let result: CheckResult;
  try {
    result = await generator.check();
  } catch (error) {
    // A TMS failure is not a verdict: exiting 1 would be indistinguishable from
    // genuinely outdated types, so CI could not tell a blip from a real drift.
    if (isCheckBlocked(error)) {
      console.error(`✗ Check could not run: ${error.message}`);
      process.exit(EXIT_CHECK_FAILED);
    }
    throw error;
  }

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
