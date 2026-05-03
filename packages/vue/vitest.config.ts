import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
