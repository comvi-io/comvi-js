/**
 * Init command - Create .comvirc.json configuration file
 *
 * Usage:
 *   comvi init                    # Create config (apiKey from env var)
 *   comvi init --api-key <key>    # Create config with apiKey (not recommended)
 */

import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { ApiClient } from "../core/ApiClient";
import type { ComviConfig } from "../types";

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new .comvirc.json configuration file")
    .option("-k, --api-key <key>", "API key for TMS (prefer COMVI_API_KEY env var)")
    .option("-u, --api-url <url>", "API base URL", "https://api.comvi.io")
    .option("-o, --output <path>", "Output path for generated types", "src/types/i18n.d.ts")
    .option("--no-strict-params", "Make all params optional")
    .option("--default-ns <name>", "Default namespace name", "default")
    .option("--translations-path <path>", "Local translations folder", "./src/locales")
    .option("--file-template <template>", "File template pattern", "{languageTag}/{namespace}.json")
    .action(async (options) => {
      try {
        // Check for API key from env var or flag
        const apiKey = options.apiKey || process.env.COMVI_API_KEY;

        const config: Partial<ComviConfig> = {
          // Only include apiKey if explicitly provided via --api-key flag
          // Environment variable is preferred and will be read at runtime
          ...(options.apiKey ? { apiKey: options.apiKey } : {}),
          apiBaseUrl: options.apiUrl,
          outputPath: options.output,
          strictParams: options.strictParams !== false,
          defaultNsName: options.defaultNs,
          translationsPath: options.translationsPath,
          fileTemplate: options.fileTemplate,
        };

        // Validate API key if available (from flag or env var)
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

        // Show appropriate message based on API key source
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
        if (!apiKey) {
          console.log("  1. Set COMVI_API_KEY environment variable");
          console.log("  2. Run 'comvi generate-types' to generate types");
        } else {
          console.log("  1. Run 'comvi generate-types' to generate types");
        }
        console.log("  3. Or run 'comvi generate-types --watch' for real-time updates");
        console.log("  4. Run 'comvi pull' to download translations");
        console.log("  5. Run 'comvi push' to upload translations");
      } catch (error) {
        if (error instanceof Error) {
          console.error(`✗ Failed to initialize: ${error.message}`);
        }
        process.exit(1);
      }
    });
}
