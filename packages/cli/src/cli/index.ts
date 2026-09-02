#!/usr/bin/env node

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
import { CLI_VERSION } from "../utils/version";
import { EXIT_VALIDATION } from "../utils/errors";

const program = new Command();

program
  .name("comvi")
  .description("CLI for Comvi i18n - type generation, translation sync, and more")
  .version(CLI_VERSION)
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

program.addCommand(createInitCommand());
program.addCommand(createTypegenCommand());
program.addCommand(createGenerateTypesCommand()); // Verbose alias
program.addCommand(createGenerateCommand()); // Legacy alias
program.addCommand(createPullCommand());
program.addCommand(createPushCommand());

program.parse();
