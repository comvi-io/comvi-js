import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { resolve } from "path";

export default defineConfig({
  plugins: [solid()],
  test: {
    globals: true,
    environment: "happy-dom",
    define: {
      __DEV__: JSON.stringify(true),
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
    conditions: ["development", "browser"],
  },
});
