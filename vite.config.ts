import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiBaseUrl = env.VITE_COMVI_API_BASE_URL?.trim();

  // The in-context editor runtime must ship inside the extension package —
  // MV3 forbids loading remote code, so it is bundled and injected via
  // chrome.scripting.executeScript({ files: ["editor.iife.js"], world: "MAIN" }).
  const editorBundlePath =
    env.COMVI_EDITOR_BUNDLE_PATH?.trim() ||
    resolve(__dirname, "../js-sdk/packages/plugin-in-context-editor/dist/standalone.iife.js");

  if (!existsSync(editorBundlePath)) {
    throw new Error(
      `In-context editor bundle not found at ${editorBundlePath}. ` +
        "Build it first (cd ../js-sdk && pnpm build) or point COMVI_EDITOR_BUNDLE_PATH " +
        "at a standalone.iife.js build of @comvi/plugin-in-context-editor.",
    );
  }

  if (!apiBaseUrl) {
    throw new Error(
      "VITE_COMVI_API_BASE_URL is required to build @comvi/chrome-extension. " +
        "Set it to the API origin used by the in-context editor runtime.",
    );
  }

  return {
    // The copy-static-files plugin below copies exactly what the package needs
    // (manifest, popup.html, editor bundle, PNG icons). Disable Vite's default
    // public/ passthrough so the SVG icon sources don't leak into dist/ and the
    // CWS zip.
    publicDir: false,
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

          // Copy the bundled in-context editor runtime
          copyFileSync(editorBundlePath, resolve(__dirname, "dist/editor.iife.js"));

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
