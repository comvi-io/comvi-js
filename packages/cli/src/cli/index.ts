#!/usr/bin/env node

/**
 * Comvi CLI
 *
 * Commands:
 * - init: Create .comvirc.json configuration
 * - typegen: Generate TypeScript types from TMS (canonical name in docs)
 * - generate-types: Alias for typegen (verbose form)
 * - generate: Alias for typegen (legacy short form, one-time only)
 * - pull: Download translations from TMS
 * - push: Upload translations to TMS
 *
 * Global flags:
 * - --env-file <path>: load a specific .env file instead of auto-discovery
 * - --no-env-file:     skip auto-loading .env entirely
 *   (env equivalent: COMVI_NO_ENV=1)
 */

import { Command } from "commander";
import { createInitCommand } from "../commands/init";
import {
  createGenerateTypesCommand,
  createGenerateCommand,
  createTypegenCommand,
} from "../commands/generate-types";
import { createPullCommand } from "../commands/pull";
import { createPushCommand } from "../commands/push";
import { loadEnv, MissingEnvFileError } from "../core/EnvLoader";

const EXIT_VALIDATION = 4;

const program = new Command();

program
  .name("comvi")
  .description("CLI for Comvi i18n - type generation, translation sync, and more")
  .version("1.0.0")
  .option("--env-file <path>", "load a specific .env file instead of auto-discovery")
  .option("--no-env-file", "skip auto-loading .env (also: COMVI_NO_ENV=1)")
  .hook("preAction", (thisCommand) => {
    // Resolve once, before any subcommand handler runs. Real env vars take
    // precedence — `loadEnv` never overwrites an existing process.env entry.
    const opts = thisCommand.opts<{ envFile?: string | false }>();
    const envFile = opts.envFile;
    const disabled = envFile === false || process.env.COMVI_NO_ENV === "1";

    try {
      const result = loadEnv({
        explicitPath: typeof envFile === "string" ? envFile : undefined,
        disabled,
      });

      if (result && process.env.COMVI_DEBUG === "1") {
        process.stderr.write(
          `[comvi] loaded env from ${result.path} ` +
            `(${result.added} added, ${result.skipped} skipped — process.env wins)\n`,
        );
      }
    } catch (error) {
      if (error instanceof MissingEnvFileError) {
        process.stderr.write(`✗ ${error.message}\n`);
        process.exit(EXIT_VALIDATION);
      }
      throw error;
    }
  });

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createTypegenCommand());
program.addCommand(createGenerateTypesCommand()); // Verbose alias
program.addCommand(createGenerateCommand()); // Legacy alias
program.addCommand(createPullCommand());
program.addCommand(createPushCommand());

// Parse arguments
program.parse();
