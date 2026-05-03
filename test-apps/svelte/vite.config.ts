import { defineConfig, mergeConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { comviDevConfig } from "@comvi/vite-config";
import { comviTypes } from "@comvi/vite-plugin";

// Get shared Comvi development configuration
const comviConfig = comviDevConfig({
  rootDir: "../..",
});

export default mergeConfig(
  comviConfig,
  defineConfig({
    plugins: [
      comviTypes({
        translations: "../locales",
        output: "./src/types/i18n.d.ts",
        fileTemplate: "{namespace}/{languageTag}.json",
        defaultNs: "default",
      }),
      svelte(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
      },
    },
    clearScreen: false,
  }),
);
