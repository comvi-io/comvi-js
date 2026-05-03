import { defineConfig, mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { comviDevConfig } from "@comvi/vite-config";
import { comviTypes } from "@comvi/vite-plugin";

// Get shared Comvi development configuration
// This enables transparent HMR for workspace packages
const comviConfig = comviDevConfig({
  rootDir: "../..",
});

export default mergeConfig(
  comviConfig,
  defineConfig({
    plugins: [
      comviTypes({
        translations: "./src/locales",
        output: "./src/types/i18n.d.ts",
        fileTemplate: "{namespace}/{languageTag}.json",
        defaultNs: "default",
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    clearScreen: false,
  }),
);
