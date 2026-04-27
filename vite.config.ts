import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const editorScriptUrl = env.VITE_COMVI_EDITOR_SCRIPT_URL?.trim();
  const apiBaseUrl = env.VITE_COMVI_API_BASE_URL?.trim();

  if (!editorScriptUrl || !editorScriptUrl.includes("://")) {
    throw new Error(
      "VITE_COMVI_EDITOR_SCRIPT_URL must be an absolute URL to a hosted in-context editor runtime " +
        "(e.g. https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor/dist/standalone.iife.js).",
    );
  }

  if (!apiBaseUrl) {
    throw new Error(
      "VITE_COMVI_API_BASE_URL is required to build @comvi/chrome-extension. " +
        "Set it to the API origin used by the in-context editor runtime.",
    );
  }

  return {
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          background: resolve(__dirname, "src/background/service-worker.ts"),
          detector: resolve(__dirname, "src/content/detector.ts"),
          bridge: resolve(__dirname, "src/content/bridge.ts"),
          popup: resolve(__dirname, "src/popup/popup.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name].[ext]",
          format: "es",
        },
      },
      minify: false, // Keep readable for debugging during development
      sourcemap: false,
    },
    plugins: [
      tailwindcss(),
      {
        name: "copy-static-files",
        closeBundle() {
          // Copy manifest.json
          copyFileSync(
            resolve(__dirname, "manifest.json"),
            resolve(__dirname, "dist/manifest.json"),
          );

          // Copy popup.html
          copyFileSync(
            resolve(__dirname, "src/popup/popup.html"),
            resolve(__dirname, "dist/popup.html"),
          );

          // Create icons directory and copy icons
          const iconsDir = resolve(__dirname, "dist/icons");
          if (!existsSync(iconsDir)) {
            mkdirSync(iconsDir, { recursive: true });
          }

          // Copy icons if they exist
          const publicIconsDir = resolve(__dirname, "public/icons");
          if (existsSync(publicIconsDir)) {
            for (const fileName of readdirSync(publicIconsDir)) {
              if (fileName.endsWith(".png")) {
                copyFileSync(resolve(publicIconsDir, fileName), resolve(iconsDir, fileName));
              }
            }
          }
        },
      },
    ],
  };
});
