// Builds the framework rows' apps (gate-e/frameworks/<fw>/) with each framework's own Vite
// plugin into gate-e/frameworks/dist/<fw>/main.js, which mock-api-server.mjs serves under
// /built/<fw>/, then the SSR rows with `next build` and `nuxi build` (serve.mjs runs them). The bindings and core resolve from the workspace dists (turbo `^build` of
// `test:e2e` builds them first). Development mode: the framework runtimes print their
// warnings, which the rows require to be absent.
import { spawnSync } from "node:child_process";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import solid from "vite-plugin-solid";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const DIR = dirname(fileURLToPath(import.meta.url));

const APPS = {
  react: { entry: "main.tsx", plugins: [react()] },
  vue: { entry: "main.ts", plugins: [vue()] },
  solid: { entry: "main.tsx", plugins: [solid()] },
  svelte: { entry: "main.ts", plugins: [svelte()] },
};

/** The SSR rows: each framework's own production build, served by serve.mjs. */
const SSR = {
  next: ["next", "build"],
  nuxt: ["nuxi", "build"],
};

const only = process.argv.slice(2);
for (const [name, app] of Object.entries(APPS)) {
  if (only.length > 0 && !only.includes(name)) continue;
  await build({
    configFile: false,
    root: join(DIR, name),
    mode: "development",
    logLevel: "warn",
    plugins: app.plugins,
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    build: {
      outDir: join(DIR, "dist", name),
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        input: join(DIR, name, app.entry),
        output: { format: "es", entryFileNames: "main.js", chunkFileNames: "[name].js" },
      },
    },
  });
  console.log(`[gate-e] built the ${name} row`);
}

for (const [name, [bin, ...args]] of Object.entries(SSR)) {
  if (only.length > 0 && !only.includes(name)) continue;
  const result = spawnSync(join(DIR, "../../node_modules/.bin", bin), args, {
    cwd: join(DIR, name),
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NUXT_TELEMETRY_DISABLED: "1" },
  });
  if (result.status !== 0) {
    console.error(`[gate-e] the ${name} row did not build`);
    process.exit(result.status ?? 1);
  }
  console.log(`[gate-e] built the ${name} row`);
}
