import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    // Add "use client" directive for Next.js App Router compatibility
    {
      name: "add-use-client",
      generateBundle(_, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === "chunk") {
            chunk.code = `"use client";\n${chunk.code}`;
          }
        }
      },
    },
  ],
  build: createLibraryBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviReact",
    fileNames: { es: "comvi-react.js", cjs: "comvi-react.cjs" },
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@comvi/core",
      "use-sync-external-store",
      "use-sync-external-store/shim",
    ],
    globals: {
      react: "React",
      "react-dom": "ReactDOM",
      "react/jsx-runtime": "jsxRuntime",
      "@comvi/core": "ComviCore",
    },
  }),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
