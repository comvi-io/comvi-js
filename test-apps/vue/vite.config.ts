import { defineConfig, mergeConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { comviDevConfig } from "@comvi/vite-config";
import { comviTypes } from "@comvi/vite-plugin";

const comviConfig = comviDevConfig({
  rootDir: "../..",
});

export default mergeConfig(
  comviConfig,
  defineConfig({
    plugins: [
      // Writes src/types/i18n.d.ts on `vite build` and on every catalog change in
      // `vite dev`; `pnpm typecheck` writes the same bytes with `comvi typegen --from`.
      comviTypes({ from: "../locales", sourceLocale: "en" }),
      vue(),
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
