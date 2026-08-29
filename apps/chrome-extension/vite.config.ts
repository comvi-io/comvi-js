import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiBaseUrl = env.VITE_COMVI_API_BASE_URL?.trim();

  // The in-context editor runtime must ship inside the extension package —
  // MV3 forbids loading remote code, so it is bundled and injected via
  // chrome.scripting.executeScript({ files: ["editor.iife.js"], world: "MAIN" }).
  const editorBundlePath =
    env.COMVI_EDITOR_BUNDLE_PATH?.trim() ||
    resolve(__dirname, "../../packages/plugin-in-context-editor/dist/standalone.iife.js");

  if (!existsSync(editorBundlePath)) {
    throw new Error(
      `In-context editor bundle not found at ${editorBundlePath}. ` +
        "Build @comvi/plugin-in-context-editor first or point COMVI_EDITOR_BUNDLE_PATH " +
        "at a standalone.iife.js build of @comvi/plugin-in-context-editor.",
    );
  }

  if (!apiBaseUrl) {
    throw new Error(
      "VITE_COMVI_API_BASE_URL is required to build @comvi/chrome-extension. " +
        "Set it to the API origin used by the in-context editor runtime.",
    );
  }

  // The service worker performs all authenticated API requests, so the
  // manifest must grant exactly (and only) the configured API origin.
  let apiOrigin: string;
  try {
    apiOrigin = new URL(apiBaseUrl).origin;
  } catch {
    throw new Error(`VITE_COMVI_API_BASE_URL is not a valid URL: ${apiBaseUrl}`);
  }
  // Production requires https. Plain http is permitted ONLY for exact
  // loopback hosts, matching the runtime origin policy in src/shared/origins.ts
  // — this is what lets the Gate-E build talk to a local mock API.
  const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const apiUrl = new URL(apiBaseUrl);
  const isLoopbackHttp = apiUrl.protocol === "http:" && LOOPBACK_HOSTS.has(apiUrl.hostname);
  if (apiUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error(
      `VITE_COMVI_API_BASE_URL must be https (or http on a loopback host), got: ${apiBaseUrl}`,
    );
  }

  // Output directory. Overridable so the Gate-E build can go to its own dir
  // (dist-gate-e) without clobbering the shippable dist/. The copy plugin
  // below honors the same value — do NOT use vite's --outDir flag, which the
  // plugin cannot see.
  const outDir = env.COMVI_OUT_DIR?.trim() || "dist";
  const outPath = (...parts: string[]) => resolve(__dirname, outDir, ...parts);
  const testPageOriginValue = env.COMVI_TEST_PAGE_ORIGIN?.trim();
  let testPageOrigin: string | undefined;
  if (testPageOriginValue) {
    const testPageUrl = new URL(testPageOriginValue);
    if (outDir === "dist" || !LOOPBACK_HOSTS.has(testPageUrl.hostname)) {
      throw new Error(
        "COMVI_TEST_PAGE_ORIGIN is restricted to non-release builds on an exact loopback host",
      );
    }
    testPageOrigin = testPageUrl.origin;
  }

  return {
    // The copy-static-files plugin below copies exactly what the package needs
    // (manifest, popup.html, editor bundle, PNG icons). Disable Vite's default
    // public/ passthrough so the SVG icon sources don't leak into dist/ and the
    // CWS zip.
    publicDir: false,
    build: {
      outDir,
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
          // Copy manifest.json, pinning host_permissions to the configured
          // API origin so the shipped manifest always matches the build.
          const manifest = JSON.parse(readFileSync(resolve(__dirname, "manifest.json"), "utf8"));
          manifest.host_permissions = [
            `${apiOrigin}/*`,
            ...(testPageOrigin ? [`${testPageOrigin}/*`] : []),
          ];
          writeFileSync(outPath("manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

          copyFileSync(resolve(__dirname, "src/popup/popup.html"), outPath("popup.html"));

          copyFileSync(editorBundlePath, outPath("editor.iife.js"));

          const iconsDir = outPath("icons");
          if (!existsSync(iconsDir)) {
            mkdirSync(iconsDir, { recursive: true });
          }

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
