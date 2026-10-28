import path from "node:path";
import { Command } from "commander";
import { generate, watch, type GenerateMessage, type GenerateOptions } from "@comvi/typegen";
import { ConfigLoader } from "../core/ConfigLoader";
import { platformSource, toCliError } from "../core/typegen";
import { DEFAULT_OUTPUT_PATH } from "../defaults";
import type { ComviConfig } from "../types";
import { EXIT_FAILURE, EXIT_VALIDATION, exitCodeFor } from "../utils/errors";

const CHECK_DESCRIPTION =
  "CI mode: verify the generated types are up to date, writing nothing " +
  "(exit 1 = outdated, 2 = platform unavailable, 3 = key rejected, " +
  "4 = invalid config, catalogs or a schema that cannot be emitted)";

interface TypegenFlags {
  config?: string;
  from?: string;
  out?: string;
  sourceLocale?: string;
  watch?: boolean;
  check?: boolean;
}

/**
 * `comvi typegen`: a thin wrapper over the typegen Node API, so it writes the same bytes as
 * `generate()`, `@comvi/vite-plugin`, Next and Nuxt for the same catalogs.
 *
 * Without `--from` the schema comes from the platform (`GET /schema/v2`; `--watch` follows
 * the v1 schema stream as its change signal). `--from` names a directory of JSON catalogs
 * or a wire schema file (`.comvi/schema.json`, written by `comvi pull`) and needs no key.
 */
export function createTypegenCommand(): Command {
  return new Command("typegen")
    .description("Generate the TypeScript declaration of your translation catalogs")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option(
      "--from <path>",
      "Local catalogs instead of the platform: a directory of JSON files, or .comvi/schema.json",
    )
    .option(
      "-o, --out <file>",
      `Declaration file to write (default: outputPath, ${DEFAULT_OUTPUT_PATH})`,
    )
    .option(
      "--source-locale <locale>",
      "With --from: the locale the types come from (default: sourceLocale)",
    )
    .option("-w, --watch", "Regenerate on every change of the catalogs")
    .option("--check", CHECK_DESCRIPTION)
    .action(async (flags: TypegenFlags) => {
      try {
        if (flags.watch && flags.check) {
          console.error("✗ --watch and --check cannot be combined");
          process.exit(EXIT_VALIDATION);
        }
        const local = flags.from !== undefined;
        const config = await ConfigLoader.load(flags.config, {
          requireApiKey: !local,
          optional: local,
        });
        const options = generateOptions(config, flags);

        if (flags.watch) runWatch(options);
        else await runOnce(options, Boolean(flags.check));
      } catch (error) {
        const cliError = toCliError(error);
        if (cliError instanceof Error) console.error(`✗ Error: ${cliError.message}`);
        process.exit(exitCodeFor(cliError));
      }
    });
}

function generateOptions(config: ComviConfig, flags: TypegenFlags): GenerateOptions {
  return {
    from: flags.from ?? platformSource(config),
    out: flags.out ?? config.outputPath ?? DEFAULT_OUTPUT_PATH,
    root: process.cwd(),
    sourceLocale: flags.sourceLocale ?? config.sourceLocale,
    // `.{extension}` is the CLI's spelling of the one format it writes.
    fileTemplate: config.fileTemplate?.replace("{extension}", "json"),
    augment: config.augment,
    defaultParams: config.defaultParams,
    onMessage: print,
  };
}

function print({ level, text }: GenerateMessage): void {
  if (level === "info") console.log(`  ${text}`);
  else console.error(`${level === "warn" ? "⚠ " : "✗"} ${text}`);
}

const shown = (file: string) => path.relative(process.cwd(), path.resolve(file)) || file;

async function runOnce(options: GenerateOptions, check: boolean): Promise<void> {
  const source = typeof options.from === "string" ? options.from : "the platform";
  console.log(`🔄 Reading the schema from ${source}...`);
  const result = await generate({ ...options, check });
  const counts = `${result.keys} keys, ${result.namespaces} namespaces`;
  if (check) {
    if (!result.stale) {
      console.log(`✓ Types are up to date (${counts}) → ${shown(options.out)}`);
      process.exit(0);
    }
    console.error(
      `✗ Types are outdated: ${shown(options.out)} differs from the schema (${counts})`,
    );
    console.error(
      `  Run 'comvi typegen${typeof options.from === "string" ? ` --from ${options.from}` : ""}' to update.`,
    );
    process.exit(EXIT_FAILURE);
  }
  console.log(
    result.written
      ? `✓ Generated ${counts} → ${shown(options.out)}`
      : `✓ Up to date (${counts}), ${shown(options.out)} left as it was`,
  );
  process.exit(0);
}

function runWatch(options: GenerateOptions): void {
  // Keep the process alive: a second watcher of the same file holds nothing but an
  // unref'd timer while it waits to take over.
  const keepAlive = setInterval(() => undefined, 2 ** 30);
  const close = () => {
    clearInterval(keepAlive);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    watcher.close();
  };
  // SIGTERM too: Docker, systemd and CI runners stop processes with it.
  const stop = () => {
    close();
    console.log("\n✓ Stopped watching");
    process.exit(0);
  };
  const watcher = watch({
    ...options,
    // A refused key cannot recover: stop instead of watching nothing.
    onFatal: (error) => {
      close();
      console.error(`✗ Watch stopped: ${error.message}`);
      process.exit(exitCodeFor(toCliError(error)));
    },
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  void watcher.ready.then(() => {
    if (watcher.active) console.log("✓ Watching for changes...");
    console.log("Press Ctrl+C to stop\n");
  });
}
