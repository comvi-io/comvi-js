import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import { comviTypes } from "@comvi/vite-plugin";

export default defineConfig({
  plugins: [
    // Writes src/types/i18n.d.ts from the English catalogs on `vite build` and on every
    // catalog change in `vite dev`, so `t()` checks keys and parameters.
    comviTypes({ from: "./src/locales", sourceLocale: "en" }),
    solidStart(),
    nitro(),
  ],
});
