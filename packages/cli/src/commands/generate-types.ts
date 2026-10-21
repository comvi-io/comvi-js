import { Command } from "commander";
import { TypeGenerator } from "../core/TypeGenerator";
import { ConfigLoader } from "../core/ConfigLoader";
import {
  ErrorCodes,
  EXIT_FAILURE,
  exitCodeFor,
  isTypegenError,
  type TypegenError,
} from "../utils/errors";
import type { CheckResult } from "../types";

/** Errors that mean the check never got to compare anything. */
const CHECK_BLOCKING_CODES: readonly string[] = [
  ErrorCodes.API_CONNECTION_FAILED,
  ErrorCodes.API_AUTH_FAILED,
  ErrorCodes.API_FETCH_FAILED,
  ErrorCodes.API_TIMEOUT,
  ErrorCodes.API_INVALID_RESPONSE,
];

const CHECK_DESCRIPTION =
  "CI mode: verify the generated types are up to date " +
  "(exit 1 = outdated, 2 = platform unavailable, 3 = key rejected, " +
  "4 = invalid config or a schema that cannot be emitted)";

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
        process.exit(exitCodeFor(error));
      }
    });
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
    process.exit(exitCodeFor(result.cause));
  }
}

async function runWatchMode(generator: TypeGenerator): Promise<void> {
  console.log("🔄 Fetching initial schema from TMS...");
  const result = await generator.generate();

  if (!result.success) {
    console.error(`✗ Initial generation failed: ${result.error}`);
    process.exit(exitCodeFor(result.cause));
  }

  console.log(`✓ Generated ${result.keysGenerated} keys → ${result.filePath}`);

  console.log("\n👀 Subscribing to real-time updates...");

  const apiClient = generator.getApiClient();

  const cleanup = await apiClient.subscribeToSchemaUpdates(
    async (schema) => {
      console.log("\n🔄 Received schema update via SSE...");
      const updateResult = await generator.generateFromSchema(schema);

      if (updateResult.success) {
        console.log(`✓ Updated ${updateResult.keysGenerated} keys → ${updateResult.filePath}`);
      } else {
        console.error(`⚠  Update failed: ${updateResult.error}`);
      }
    },
    {
      // A rejected key cannot recover: stop instead of watching nothing.
      onFatal: (error) => {
        console.error(`✗ Watch stopped: ${error.message}`);
        process.exit(exitCodeFor(error));
      },
      onNotice: (message) => console.error(`⚠  ${message}`),
    },
  );

  console.log("✓ Watching for changes...");
  console.log("Press Ctrl+C to stop\n");

  // SIGTERM too: Docker, systemd and CI runners stop processes with it.
  const stop = () => {
    console.log("\n\n🛑 Closing SSE connection...");
    cleanup();
    console.log("✓ Stopped watching");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

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
      process.exit(exitCodeFor(error));
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
    process.exit(EXIT_FAILURE);
  }
}
