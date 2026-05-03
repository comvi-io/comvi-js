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

const program = new Command();

program
  .name("comvi")
  .description("CLI for Comvi i18n - type generation, translation sync, and more")
  .version("1.0.0");

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createTypegenCommand());
program.addCommand(createGenerateTypesCommand()); // Verbose alias
program.addCommand(createGenerateCommand()); // Legacy alias
program.addCommand(createPullCommand());
program.addCommand(createPushCommand());

// Parse arguments
program.parse();
