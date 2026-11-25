import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { comviTypes } from "@comvi/vite-plugin";

export default defineConfig({
  plugins: [
    // Writes src/types/i18n.d.ts from the English catalogs on `vite build` and on every
    // catalog change in `vite dev`, so `t()` checks keys and parameters.
    comviTypes({ from: "./src/locales", sourceLocale: "en" }),
    react(),
  ],
});
