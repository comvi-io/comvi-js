import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ compilerOptions: { dev: true } })],
  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.svelte"],
      exclude: ["tests/**", "node_modules/**", "dist/**"],
    },
  },
  resolve: {
    conditions: ["browser"],
  },
});
