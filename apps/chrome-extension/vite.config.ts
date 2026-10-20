import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { isReleaseOutput, RELEASE_DIR_NAME } from "./src/build/release-output";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiBaseUrl = env.VITE_COMVI_API_BASE_URL?.trim();

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
  const outDir = env.COMVI_OUT_DIR?.trim() || RELEASE_DIR_NAME;
  // A gate-e build that points at a non-loopback API is a mis-configured build (typically a
  // production VITE_COMVI_API_BASE_URL leaking in from the environment): its host_permissions
  // would not cover the mock origin and every popup check would silently fail.
  if (mode === "gate-e" && !isLoopbackHttp) {
    throw new Error(`gate-e builds require a loopback VITE_COMVI_API_BASE_URL, got: ${apiBaseUrl}`);
  }
  const outPath = (...parts: string[]) => resolve(__dirname, outDir, ...parts);
  const testPageOriginValue = env.COMVI_TEST_PAGE_ORIGIN?.trim();
  let testPageOrigin: string | undefined;
  if (testPageOriginValue) {
    const testPageUrl = new URL(testPageOriginValue);
    // Compare resolved paths: "./dist" or an absolute path is still dist/.
    if (isReleaseOutput(outDir, __dirname) || !LOOPBACK_HOSTS.has(testPageUrl.hostname)) {
      throw new Error(
        "COMVI_TEST_PAGE_ORIGIN is restricted to non-release builds on an exact loopback host",
      );
    }
    testPageOrigin = testPageUrl.origin;
  }

  return {
    // The copy-static-files plugin below copies exactly what the package needs
    // (manifest, popup.html, PNG icons). Disable Vite's default
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
