import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { solidBuild } from "./vite.shared";

export default defineConfig({
  plugins: [
    solid(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: solidBuild(__dirname),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
