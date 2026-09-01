import { Command } from "commander";
import { promises as fs } from "fs";
import { ConfigLoader } from "../core/ConfigLoader";
import { ApiClient } from "../core/ApiClient";
import { DEFAULT_FILE_TEMPLATE } from "../defaults";
import type { ComviConfig } from "../types";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new .comvirc.json configuration file")
    .option("-k, --api-key <key>", "API key for TMS (prefer COMVI_API_KEY env var)")
    .option("-u, --api-url <url>", "API base URL", "https://api.comvi.io")
    .option("-o, --output <path>", "Output path for generated types", "src/types/i18n.d.ts")
    .option("--no-strict-params", "Make all params optional")
    .option("--translations-path <path>", "Local translations folder", "./src/locales")
    .option("--file-template <template>", "File template pattern", DEFAULT_FILE_TEMPLATE)
    .option("--force", "Overwrite an existing .comvirc.json")
    .action(async (options) => {
      // `create()` replaces the file wholesale, so re-running init without this
      // guard silently dropped a configured project's namespaces, locales and
      // push/pull settings.
      const configPath = ConfigLoader.defaultConfigPath();
      if (!options.force && (await fileExists(configPath))) {
        console.error(`✗ Configuration already exists: ${configPath}`);
        console.error(
          "   Re-run 'comvi init --force' to overwrite it. The existing file was left untouched.",
        );
        process.exit(1);
      }

      try {
        if (options.apiKey) {
          console.error(
            "⚠  --api-key is visible to other local users (ps) and shell history. " +
              "Prefer the COMVI_API_KEY environment variable.",
          );
        }

        const apiKey = options.apiKey || process.env.COMVI_API_KEY;

        const config: Partial<ComviConfig> = {
          // Only include apiKey if explicitly provided via --api-key flag
          // Environment variable is preferred and will be read at runtime
          ...(options.apiKey ? { apiKey: options.apiKey } : {}),
          apiBaseUrl: options.apiUrl,
          outputPath: options.output,
          strictParams: options.strictParams !== false,
          translationsPath: options.translationsPath,
          fileTemplate: options.fileTemplate,
        };

        if (apiKey) {
          console.log("🔄 Validating API key...");
          try {
            const apiClient = new ApiClient({
              apiKey: apiKey,
              apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
            });
            const projectInfo = await apiClient.validateApiKey();
            console.log(`✓ API key valid for project: ${projectInfo.name}`);
          } catch (error) {
            if (error instanceof Error) {
              console.error(`⚠  API key validation failed: ${error.message}`);
              console.log("   You can still create the config and fix the API key later.");
            }
          }
        }

        const filePath = await ConfigLoader.create(config);

        console.log(`✓ Created configuration file: ${filePath}`);

        if (!apiKey) {
          console.log("\n⚠  API key not found. Set COMVI_API_KEY environment variable:");
          console.log("   export COMVI_API_KEY=your_api_key_here");
          console.log("\n   Or add to .env file:");
          console.log("   COMVI_API_KEY=your_api_key_here");
        } else if (!options.apiKey) {
          console.log("\n✓ Using API key from COMVI_API_KEY environment variable");
        } else {
          console.log(
            "\n⚠  API key stored in config file. Consider using COMVI_API_KEY env var instead.",
          );
        }

        console.log("\nNext steps:");

        const steps: Array<{ text: string; hint?: string }> = [
          ...(apiKey ? [] : [{ text: "Set COMVI_API_KEY environment variable" }]),
          {
            text: "Run 'comvi generate-types' to generate types",
            hint: "or 'comvi generate-types --watch' for real-time updates",
          },
          { text: "Run 'comvi pull' to download translations" },
          { text: "Run 'comvi push' to upload translations" },
        ];

        steps.forEach((step, index) => {
          console.log(`  ${index + 1}. ${step.text}`);
          if (step.hint) {
            console.log(`     (${step.hint})`);
          }
        });
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Failed to initialize: ${error.message}`);
        }
        process.exit(1);
      }
    });
}
