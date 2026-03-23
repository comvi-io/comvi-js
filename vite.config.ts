import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

export default defineConfig({
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
    {
      name: "copy-static-files",
      closeBundle() {
        // Copy manifest.json
        copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));

        // Copy popup.html
        copyFileSync(
          resolve(__dirname, "src/popup/popup.html"),
          resolve(__dirname, "dist/popup.html"),
        );

        // Copy popup.css
        copyFileSync(
          resolve(__dirname, "src/popup/popup.css"),
          resolve(__dirname, "dist/popup.css"),
        );

        // Create icons directory and copy icons
        const iconsDir = resolve(__dirname, "dist/icons");
        if (!existsSync(iconsDir)) {
          mkdirSync(iconsDir, { recursive: true });
        }

        // Copy icons if they exist
        const publicIconsDir = resolve(__dirname, "public/icons");
        if (existsSync(publicIconsDir)) {
          const iconSizes = ["16", "32", "48", "128"];
          for (const size of iconSizes) {
            const srcIcon = resolve(publicIconsDir, `icon-${size}.png`);
            if (existsSync(srcIcon)) {
              copyFileSync(srcIcon, resolve(iconsDir, `icon-${size}.png`));
            }
          }
        }
      },
    },
  ],
});
