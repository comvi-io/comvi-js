/**
 * Does a generated declaration file actually constrain `t()` in an app that
 * installed ONE package, under a node_modules layout that hoists nothing?
 *
 * That is the documented install: `pnpm add @comvi/react`, and `@comvi/core` is
 * react's TRANSITIVE dependency. Under pnpm (or Yarn PnP) the app cannot resolve
 * core, so the `declare module '@comvi/core'` block in the generated file has
 * nothing to augment. TypeScript reports TS2882 on the generated import;
 * `skipLibCheck: true` — which plenty of apps set — hides that error, and every
 * unknown translation key then type-checks. The types look like they work.
 *
 * The four cases below pin both halves of that: WHY the generators now refuse to
 * write for such an app (A, B), that they DO refuse (C), and that the
 * declarations constrain keys once `@comvi/core` is a direct dependency (D).
 *
 * The layout is built the way pnpm builds one: every package lives once in a
 * store and is reached through symlinks, so a direct `@comvi/core` dependency
 * and react's transitive one are the same realpath and therefore the same
 * TypeScript module. A copy at each site would be two modules, and the
 * augmentation would reach neither.
 *
 * Needs the workspace built (`pnpm build`) — it consumes `packages/*\/dist`, the
 * published artifacts, not the sources. `pnpm check:strict-consumer`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { comviTypes } from "@comvi/vite-plugin";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSC = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");

/** The binding the app installs, and the module the generated file augments. */
const BINDING = "@comvi/react";
const CORE = "@comvi/core";

const CATALOG = JSON.stringify({ hello: "Hello", greeting: "Hi {name}" });

const INDEX_WITH_ASSERTION = `import { createI18n } from "${BINDING}";

const i18n = createI18n({ locale: "en" });

i18n.t("hello");
i18n.t("greeting", { name: "Ada" });
// @ts-expect-error the generated types must reject a key the schema does not have
i18n.t("missing");
`;

const INDEX_UNKNOWN_KEY = `import { createI18n } from "${BINDING}";

const i18n = createI18n({ locale: "en" });

i18n.t("hello");
i18n.t("missing");
`;

/** What the generators write, so cases A and B can run without invoking one. */
const GENERATED = `/**
 * Auto-generated translation keys
 * DO NOT EDIT — this file is generated from your translation schema
 */

// Import to ensure module is resolved before augmentation
import '${CORE}';

declare module '${CORE}' {
  interface TranslationKeys {
    "greeting": { "name": string };
    "hello": never;
  }
}

export {};
`;

function fail(message) {
  console.error(`strict-consumer: ${message}`);
  process.exit(1);
}

function requireDist(pkg) {
  const dir = path.join(REPO_ROOT, "packages", pkg, "dist");
  if (!fs.existsSync(path.join(dir, "index.d.ts"))) {
    fail(`packages/${pkg}/dist is missing or has no types. Run \`pnpm build\` first.`);
  }
  return dir;
}

/** A package in the store: its manifest and its build output, nothing else. */
function stagePackage(pkg, store) {
  const source = path.join(REPO_ROOT, "packages", pkg);
  const target = path.join(
    store,
    ...JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).name.split("/"),
  );
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(source, "package.json"), path.join(target, "package.json"));
  fs.cpSync(requireDist(pkg), path.join(target, "dist"), { recursive: true });
  return target;
}

function link(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, "junction");
}

/** Where the workspace installed a third-party package react's own types need. */
function workspaceCopyOf(dependency) {
  const resolved = path.join(REPO_ROOT, "packages", "react", "node_modules", dependency);
  if (!fs.existsSync(resolved)) {
    fail(`${dependency} is not installed for packages/react. Run \`pnpm install\` first.`);
  }
  return fs.realpathSync(resolved);
}

/** Every fixture root built, removed once all cases pass. */
const appRoots = [];

/**
 * An app that depends on `@comvi/react`, with `@comvi/core` reachable only
 * through react unless `directCore` is set.
 */
function makeApp({ directCore }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-strict-consumer-"));
  appRoots.push(root);
  const store = path.join(root, "store");

  const core = stagePackage("core", store);
  const binding = stagePackage("react", store);

  // react's own dependency edges, resolvable from react and from nowhere else.
  link(core, path.join(binding, "node_modules", ...CORE.split("/")));
  for (const dependency of ["react", "@types/react"]) {
    link(workspaceCopyOf(dependency), path.join(binding, "node_modules", dependency));
  }

  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "locales"), { recursive: true });
  fs.writeFileSync(path.join(app, "locales", "en.json"), CATALOG, "utf8");

  link(binding, path.join(app, "node_modules", ...BINDING.split("/")));
  link(workspaceCopyOf("@types/react"), path.join(app, "node_modules", "@types", "react"));
  if (directCore) {
    link(core, path.join(app, "node_modules", ...CORE.split("/")));
  }

  fs.writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify(
      {
        name: "strict-consumer-app",
        private: true,
        type: "module",
        dependencies: {
          [BINDING]: "*",
          ...(directCore ? { [CORE]: "*" } : {}),
        },
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(app, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "nodenext",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          jsx: "react-jsx",
          types: [],
        },
      },
      null,
      2,
    )}\n`,
  );

  return { root, app };
}

/** Type-checks `index.ts` plus the generated file, and returns tsc's own report. */
function typecheck(app, { skipLibCheck }) {
  fs.writeFileSync(
    path.join(app, "tsconfig.case.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: { skipLibCheck },
      include: ["index.ts", "comvi.d.ts"],
    }),
  );

  const result = spawnSync(
    process.execPath,
    [TSC, "-p", "tsconfig.case.json", "--pretty", "false"],
    {
      cwd: app,
      encoding: "utf8",
    },
  );

  return { exit: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/** Runs the Vite plugin's generation the way Vite runs it, against `app` as root. */
async function generateWithVitePlugin(app) {
  const plugin = comviTypes({ translations: "./locales", output: "./comvi.d.ts" });
  plugin.configResolved({ root: app, command: "build" });
  await plugin.buildStart();
}

const cases = [];

/** @param {string} name @param {() => Promise<string[]>} run returns failure reasons */
function check(name, run) {
  cases.push({ name, run });
}

check(
  "A. without a direct @comvi/core, TypeScript cannot see the augmentation target",
  async () => {
    const { app } = makeApp({ directCore: false });
    fs.writeFileSync(path.join(app, "comvi.d.ts"), GENERATED);
    fs.writeFileSync(path.join(app, "index.ts"), INDEX_WITH_ASSERTION);

    const { exit, output } = typecheck(app, { skipLibCheck: false });
    report(output);

    return exit === 0 || !output.includes("TS2882")
      ? [`expected TS2882 on the generated import, got exit ${exit}`]
      : [];
  },
);

check("B. and with skipLibCheck the error is gone and an unknown key compiles", async () => {
  const { app } = makeApp({ directCore: false });
  fs.writeFileSync(path.join(app, "comvi.d.ts"), GENERATED);
  fs.writeFileSync(path.join(app, "index.ts"), INDEX_UNKNOWN_KEY);

  const { exit, output } = typecheck(app, { skipLibCheck: true });
  report(output || "(no diagnostics — the generated types are inert)");

  return exit === 0
    ? []
    : [`expected the unknown key to compile silently, got exit ${exit}: ${output}`];
});

check("C. so the Vite plugin refuses to write declarations for that app", async () => {
  const { app } = makeApp({ directCore: false });
  const failures = [];

  let message = "";
  try {
    await generateWithVitePlugin(app);
    failures.push("expected the plugin to refuse, it wrote the file");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  report(message.split("\n")[0]);

  if (message && !message.includes(`pnpm add -D ${CORE}`)) {
    failures.push(`refusal does not name the install command: ${message}`);
  }
  if (fs.existsSync(path.join(app, "comvi.d.ts"))) {
    failures.push("the plugin left a declaration file behind");
  }
  return failures;
});

check("D. with a direct @comvi/core, the generated keys constrain t()", async () => {
  const { app } = makeApp({ directCore: true });
  await generateWithVitePlugin(app);

  if (!fs.existsSync(path.join(app, "comvi.d.ts"))) {
    return ["the plugin wrote no declaration file"];
  }

  const failures = [];

  fs.writeFileSync(path.join(app, "index.ts"), INDEX_WITH_ASSERTION);
  const valid = typecheck(app, { skipLibCheck: false });
  report(valid.output || "(no diagnostics — known keys compile, the unknown one is rejected)");
  if (valid.exit !== 0) {
    failures.push(`known keys did not compile: exit ${valid.exit}\n${valid.output}`);
  }

  fs.writeFileSync(path.join(app, "index.ts"), INDEX_UNKNOWN_KEY);
  const unknown = typecheck(app, { skipLibCheck: false });
  report(unknown.output);
  if (unknown.exit === 0 || !unknown.output.includes("TS2345")) {
    failures.push(`expected TS2345 for the unknown key, got exit ${unknown.exit}`);
  }

  return failures;
});

function report(text) {
  for (const line of String(text).split("\n")) {
    console.log(`    ${line}`);
  }
}

const failures = [];
for (const { name, run } of cases) {
  console.log(`\n${name}`);
  const reasons = await run();
  for (const reason of reasons) console.log(`  FAILED: ${reason}`);
  if (reasons.length === 0) console.log("  ok");
  failures.push(...reasons.map((reason) => `${name}: ${reason}`));
}

console.log("");
if (failures.length > 0) {
  // The fixtures stay on disk: a failure here is reproduced by running tsc in
  // the app directory the message names, and deleting them removes that.
  fail(`${failures.length} case(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
}

for (const root of appRoots) fs.rmSync(root, { recursive: true, force: true });
console.log(`strict-consumer: OK — ${cases.length} cases.`);
