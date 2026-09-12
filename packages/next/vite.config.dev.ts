/**
 * Development build (dist/*.dev.js) — selected by bundlers via the
 * "development" export condition on every runtime entry. `__DEV__` is
 * hardcoded true so the `IS_DEV`-guarded diagnostic in `src/createNextI18n.ts`
 * (the readable `E_USE_HOST_IDENTITY` message) actually fires; the default
 * family keeps the bare error code.
 *
 * `addUseClient(".dev")` is NOT optional: `"use client"` is a per-file
 * directive Next reads from the resolved file, so the dev family needs it on
 * exactly the same modules as the prod one — with the `.dev` names.
 *
 * No `dts` plugin: the declarations are shared by both families, so the prod
 * build is their single producer (every `types` condition names them once).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { addUseClient, nextBuild } from "./vite.shared";

export default defineConfig({
  plugins: [react(), addUseClient(".dev")],
  build: nextBuild(__dirname, ".dev"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
});
