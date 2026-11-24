/**
 * Does a generated declaration file actually constrain `t()` in an app that
 * installed ONE package, under a node_modules layout that hoists nothing?
 *
 * That is the documented install: `pnpm add @comvi/react`, with `@comvi/core`
 * arriving as react's TRANSITIVE dependency. Under pnpm (or Yarn PnP) the app
 * cannot resolve core, so a file that augments `@comvi/core` has nothing to
 * attach to — TypeScript reports TS2882 on its import, `skipLibCheck: true`
 * hides that, and every unknown key then type-checks. `@comvi/typegen`
 * therefore augments the Comvi package the app DECLARES, and these cases are
 * the proof that the declaration reaches `t()` from there.
 *
 * Nothing is hardcoded: each case runs the real `@comvi/vite-plugin`, so the
 * file being type-checked is the emitter's own output, and then runs `tsc`
 * against it with `skipLibCheck: false`.
 *
 * The layout is strict by construction. The app's `node_modules` holds a link
 * to exactly the package it declares; that package's own dependencies resolve
 * from its own directory, the way pnpm arranges them. Every package is reached
 * through one link, so a direct dependency and a transitive one are the same
 * realpath and therefore the same TypeScript module.
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
import { pendingReason } from "../../tooling/migration-pending.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSC = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");

const CATALOG = JSON.stringify({ hello: "Hello", greeting: "Hi {name}" });

/** Every fixture root built, removed once all cases pass. */
const appRoots = [];

function fail(message) {
  console.error(`strict-consumer: ${message}`);
  process.exit(1);
}

/** The workspace package behind a specifier, with its build output in place. */
function packageDir(specifier) {
  const dir = path.join(REPO_ROOT, "packages", specifier.replace("@comvi/", ""));
  if (!fs.existsSync(path.join(dir, "dist"))) {
    fail(`${specifier} has no build output in ${dir}/dist. Run \`pnpm build\` first.`);
  }
  return dir;
}

function link(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, "junction");
}

/**
 * An app that declares `declares` and has exactly those packages linked into
 * its `node_modules` — nothing else is reachable from the app root.
 */
function makeApp({ declares, node10 = false }) {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-strict-consumer-"));
  appRoots.push(app);

  fs.mkdirSync(path.join(app, "locales"), { recursive: true });
  fs.writeFileSync(path.join(app, "locales", "en.json"), CATALOG, "utf8");

  for (const specifier of declares) {
    link(packageDir(specifier), path.join(app, "node_modules", ...specifier.split("/")));
  }

  fs.writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify(
      {
        name: "strict-consumer-app",
        private: true,
        type: "module",
        dependencies: Object.fromEntries(declares.map((specifier) => [specifier, "*"])),
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
          ...(node10
            ? // What Nuxt 3.7–3.9 write into `.nuxt/tsconfig.json` by default; TypeScript 6
              // reports node10 as deprecated (TS5107) unless told to ignore it.
              { module: "ESNext", moduleResolution: "node", ignoreDeprecations: "6.0" }
            : { module: "NodeNext", moduleResolution: "nodenext" }),
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          jsx: "react-jsx",
          types: [],
        },
        include: ["index.ts", "comvi.d.ts"],
      },
      null,
      2,
    )}\n`,
  );

  return app;
}

/**
 * The app's own source: it reaches `t()` through the package it declares, which
 * is the only Comvi specifier it can resolve.
 */
function writeSource(app, specifier, { assertUnknownKey }) {
  const lines = [
    `import type { I18n } from "${specifier}";`,
    "",
    "declare const i18n: I18n;",
    "",
    'i18n.t("hello");',
    'i18n.t("greeting", { name: "Ada" });',
    "",
  ];

  if (assertUnknownKey) {
    lines.push("// @ts-expect-error the generated types must reject a key the catalog lacks");
  }
  lines.push('i18n.t("missing");', "");

  fs.writeFileSync(path.join(app, "index.ts"), lines.join("\n"));
}

/** Runs the Vite plugin's generation the way Vite runs it, against `app` as root. */
async function generate(app) {
  const plugin = comviTypes({ from: "./locales", out: "./comvi.d.ts" });
  plugin.configResolved({ root: app, command: "build" });
  await plugin.buildStart();
}

/**
 * Type-checks the app with `skipLibCheck: false` and returns the diagnostics
 * reported in the APP'S OWN files.
 *
 * `skipLibCheck` stays off because that is the setting under which a generated
 * file's own problems surface — an unresolvable augmentation target is TS2882
 * in `comvi.d.ts`, an app file, and would be reported here. What is filtered
 * out is third-party noise: `@comvi/nuxt`'s types pull in the Nuxt and Vue
 * ecosystem, whose `.d.ts` files do not check cleanly outside a real Nuxt
 * project (a missing `webpack` type, a duplicated `defineProps`), and none of
 * that says anything about whether the generated keys reach `t()`.
 */
function typecheck(app) {
  const result = spawnSync(process.execPath, [TSC, "-p", "tsconfig.json", "--pretty", "false"], {
    cwd: app,
    encoding: "utf8",
  });

  const all = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const own = all
    .split("\n")
    .filter((line) => /^(index\.ts|comvi\.d\.ts)\(/.test(line))
    .join("\n");

  return { output: own, thirdParty: all.split("\n").length - own.split("\n").length };
}

function report(text) {
  for (const line of String(text).split("\n")) console.log(`    ${line}`);
}

/**
 * An app declaring exactly `specifier` gets declarations that augment it, and
 * those declarations close the key union.
 */
async function declaredPackageCase(specifier, { node10 = false } = {}) {
  const app = makeApp({ declares: [specifier], node10 });
  await generate(app);

  const generated = fs.readFileSync(path.join(app, "comvi.d.ts"), "utf8");
  const failures = [];
  if (!generated.includes(`declare module '${specifier}' {`)) {
    failures.push(`the generated file does not augment ${specifier}`);
  }
  report(generated.split("\n").slice(0, 2).join("\n"));

  writeSource(app, specifier, { assertUnknownKey: true });
  const known = typecheck(app);
  report(known.output || "(no diagnostics — known keys compile, the unknown one is rejected)");
  if (known.output !== "") {
    failures.push(`known keys did not compile:\n${known.output}`);
  }

  writeSource(app, specifier, { assertUnknownKey: false });
  const unknown = typecheck(app);
  report(unknown.output || "(no diagnostics — the unknown key COMPILED)");
  if (!unknown.output.includes("TS2345")) {
    failures.push("expected TS2345 for the unknown key");
  }
  if (/TS2307|TS2882/.test(unknown.output)) {
    failures.push("TypeScript could not resolve the declared package (TS2307/TS2882)");
  }

  return failures;
}

/**
 * A Next app's own source: the server `getI18n().t` through `@comvi/next/server` and, when
 * the app declares `@comvi/react`, the client `useI18n()` a Client Component reads.
 */
function writeNextSource(app, { client, assertUnknownKey }) {
  const unknown = (call) => [
    ...(assertUnknownKey
      ? ["  // @ts-expect-error the generated types must reject a key the catalog lacks"]
      : []),
    `  ${call}`,
  ];
  const lines = [
    'import type { GetI18n } from "@comvi/next/server";',
    ...(client ? ['import { useI18n } from "@comvi/react";'] : []),
    "",
    "declare const getI18n: GetI18n;",
    "",
    "export async function server() {",
    "  const { t } = await getI18n();",
    '  t("hello");',
    '  t("greeting", { name: "Ada" });',
    ...unknown('t("missing");'),
    "}",
    "",
  ];
  if (client) {
    lines.push(
      "export function client() {",
      "  const { t } = useI18n();",
      '  t("hello");',
      '  t("greeting", { name: "Ada" });',
      ...unknown('t("missing");'),
      "}",
      "",
    );
  }
  fs.writeFileSync(path.join(app, "index.ts"), lines.join("\n"));
}

/**
 * A Next app declaring `declares`: either its keys are typed for the server `getI18n().t`
 * (and the client `useI18n()` when it declares `@comvi/react`), or generation refuses and
 * names the packages to declare. A generated file that types nothing is the failure.
 */
async function nextCase(declares, { expectRefusal }) {
  const app = makeApp({ declares });
  const failures = [];
  const client = declares.includes("@comvi/react");

  let refusal = "";
  try {
    await generate(app);
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error);
  }

  if (refusal) {
    report(refusal);
    if (!expectRefusal) failures.push(`generation refused: ${refusal}`);
    for (const name of ["@comvi/react", "@comvi/core"]) {
      if (!refusal.includes(name)) failures.push(`the refusal does not name ${name}`);
    }
    if (fs.existsSync(path.join(app, "comvi.d.ts"))) {
      failures.push("the plugin left a declaration file behind");
    }
    return failures;
  }

  const generated = fs.readFileSync(path.join(app, "comvi.d.ts"), "utf8");
  report(generated.split("\n").slice(0, 2).join("\n"));
  if (expectRefusal) {
    failures.push(
      "generation wrote a declaration; expected a refusal naming the packages to declare",
    );
  }

  writeNextSource(app, { client, assertUnknownKey: true });
  const known = typecheck(app);
  report(known.output || "(no diagnostics — known keys compile, the unknown ones are rejected)");
  if (known.output !== "") failures.push(`known keys did not compile:\n${known.output}`);

  writeNextSource(app, { client, assertUnknownKey: false });
  const unknown = typecheck(app);
  report(unknown.output || "(no diagnostics — the unknown key COMPILED)");
  const rejected = unknown.output.split("\n").filter((line) => line.includes("TS2345")).length;
  const expected = client ? 2 : 1;
  if (rejected !== expected) {
    failures.push(
      `expected TS2345 for the unknown key in ${expected} call(s) ` +
        `(server getI18n().t${client ? " and client useI18n().t" : ""}), got ${rejected}`,
    );
  }
  if (/TS2307|TS2882/.test(unknown.output)) {
    failures.push("TypeScript could not resolve a module the app or its declaration names");
  }
  return failures;
}

const cases = [
  {
    name: "A. an app declaring only @comvi/react, with core reachable only through it",
    run: () => declaredPackageCase("@comvi/react"),
  },
  {
    name: "B. an app declaring only @comvi/nuxt, whose Catalogs is a named re-export",
    package: "@comvi/nuxt",
    run: () => declaredPackageCase("@comvi/nuxt"),
  },
  {
    // Nuxt 3.7–3.9 resolve with node10 unless `typescriptBundlerResolution` is set, and
    // node10 reads no `exports`: without a top-level `types` the package does not resolve,
    // the declaration attaches to nothing and every key compiles.
    name: "B2. the same @comvi/nuxt app under node10 resolution (Nuxt 3.7–3.9's default)",
    package: "@comvi/nuxt",
    run: () => declaredPackageCase("@comvi/nuxt", { node10: true }),
  },
  {
    name: "C. an app declaring @comvi/core directly",
    run: () => declaredPackageCase("@comvi/core"),
  },
  {
    name: "D. an app declaring no Comvi package at all",
    run: async () => {
      const app = makeApp({ declares: [] });
      const failures = [];

      let message = "";
      try {
        await generate(app);
        failures.push("expected the plugin to refuse, it wrote the file");
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      report(message.split("\n")[0]);

      if (message && !message.includes("@comvi/react")) {
        failures.push(`the refusal does not name the packages to declare: ${message}`);
      }
      if (fs.existsSync(path.join(app, "comvi.d.ts"))) {
        failures.push("the plugin left a declaration file behind");
      }
      return failures;
    },
  },
  {
    // `@comvi/next` has no root module, so a declaration augmenting it attaches to nothing
    // (TS2882, hidden by Next's `skipLibCheck: true`) and every key compiles; and without
    // `@comvi/react` declared the app cannot import the client `useI18n()` at all.
    name: "E. a Next app declaring only @comvi/next: refused, naming what to declare",
    package: "@comvi/next",
    run: () => nextCase(["@comvi/next"], { expectRefusal: true }),
  },
  {
    name: "F. a Next app with the README install (@comvi/next, @comvi/react, @comvi/core)",
    package: "@comvi/next",
    run: () => nextCase(["@comvi/next", "@comvi/react", "@comvi/core"], { expectRefusal: false }),
  },
  {
    name: "G. a Next app declaring @comvi/next and @comvi/react, core reachable only through them",
    package: "@comvi/next",
    run: () => nextCase(["@comvi/next", "@comvi/react"], { expectRefusal: false }),
  },
];

const failures = [];
let skipped = 0;
for (const { name, run, package: needs } of cases) {
  console.log(`\n${name}`);
  // A binding still on the 0.7 core is not built (tooling/migration-pending.mjs); its case
  // runs again the moment its lot removes it from the list.
  if (needs && pendingReason(needs)) {
    console.log(`  skipped — ${needs} is MIGRATION_PENDING (${pendingReason(needs)})`);
    skipped++;
    continue;
  }
  const reasons = await run();
  for (const reason of reasons) console.log(`  FAILED: ${reason}`);
  if (reasons.length === 0) console.log("  ok");
  failures.push(...reasons.map((reason) => `${name}: ${reason}`));
}

console.log("");
if (failures.length > 0) {
  // The fixtures stay on disk: a failure here is reproduced by running tsc in
  // the app directory the output names, and deleting them removes that.
  fail(`${failures.length} case(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
}

for (const root of appRoots) fs.rmSync(root, { recursive: true, force: true });
console.log(
  `strict-consumer: OK — ${cases.length - skipped} cases${skipped ? `, ${skipped} skipped (MIGRATION_PENDING)` : ""}.`,
);
