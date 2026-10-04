import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { addUseClient, reactBuild } from "./vite.shared";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    addUseClient,
  ],
  build: reactBuild(__dirname),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
