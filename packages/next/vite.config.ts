import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";

const isWatchMode = process.argv.includes("--watch");

// Files that need "use client" directive
// Note: routing.js and defineRouting.js do NOT have "use client" because defineRouting
// is used in middleware (server-side). Navigation components are in navigation.js.
const clientFiles = [
  "client.js",
  "client/I18nProvider.js",
  "navigation.js",
  "routing/Link.js",
  "routing/hooks.js",
];

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      rollupTypes: false,
    }),
    // Plugin to add "use client" directive to client files
    {
      name: "add-use-client",
      generateBundle(_, bundle) {
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type === "chunk" && clientFiles.some((f) => fileName.endsWith(f))) {
            chunk.code = `"use client";\n${chunk.code}`;
          }
        }
      },
    },
  ],
  build: {
    emptyOutDir: !isWatchMode,
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        server: resolve(__dirname, "src/server.ts"),
        client: resolve(__dirname, "src/client.ts"),
        middleware: resolve(__dirname, "src/middleware.ts"),
        routing: resolve(__dirname, "src/routing.ts"),
        navigation: resolve(__dirname, "src/navigation.ts"),
      },
      formats: ["es"],
    },
    minify: false, // Disable minification to preserve "use client"
    rolldownOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "next",
        "next/server",
        "next/headers",
        "next/navigation",
        "next/link",
        // Every `@comvi/core` specifier this package names must be external,
        // or rolldown inlines a verbatim copy of core into `dist`. Kept in sync
        // by hand: `@comvi/next` does not use `createLibraryBuildOptions`, so it
        // cannot spread `COMVI_CORE_EXTERNALS` from `@comvi/vite-config`.
        "@comvi/core",
        "@comvi/core/icu",
        "@comvi/core/loader",
        "@comvi/core/plugins",
        "@comvi/core/devtools",
        // The composed builder registers ambient tag syntax by importing this
        // side-effectful subpath (the 0.4 root did it for us); leaving it
        // non-external inlines core's whole tag graph into `dist`. Its pure
        // half rides along for the same reason: `@comvi/react`'s `<T>` is what
        // names it, and a private inlined copy could not dedupe with the app's.
        "@comvi/core/rich-text",
        "@comvi/core/tags",
        "@comvi/locale-routing",
        "@comvi/react",
        "@comvi/plugin-fetch-loader",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          next: "Next",
          "@comvi/core": "ComviCore",
          "@comvi/react": "ComviReact",
        },
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
