/**
 * Single-file-component half of the type-check gate (lot D2b).
 *
 * 120 site fences are `vue` or `svelte`, and tsc cannot read either. Their
 * checkers can, but neither is a library: `vue-tsc` and `svelte-check` are CLIs
 * that want a project on a disk. The critic doubted an in-memory host would work
 * for them, and he was right — vue-tsc's language service reaches the filesystem
 * through volar's own module resolution and svelte-check takes a `--workspace`
 * directory, not a virtual root. So the same virtual projects `typecheck.mjs`
 * compiles in memory are WRITTEN OUT here, once per page, and the checker runs
 * over the directory.
 *
 * What is written is the whole project, not just the SFCs: a `.vue` file that
 * imports `./i18n` needs `./i18n` next to it, and the fixture tree is copied in
 * under every project for exactly the reason it exists in the memory driver.
 *
 * `node_modules` is a symlink to the SDK root's, so the two halves of the gate
 * resolve `@comvi/*`, `vue` and `svelte` through the same installation, and the
 * temp tree stays small enough to delete.
 *
 * One process per page, not per fence: the invocation cost dominates (vue-tsc
 * spends ~2s loading TypeScript and volar before it looks at anything), and a
 * page is the isolation unit anyway.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { extractFences } from "./extract.mjs";
import { skipCategory } from "./lint.mjs";
import { buildProjects, mapPosition } from "./project.mjs";
import { FIXTURE_ROOT, SYNTHETIC_CATALOG, SYNTHETIC_PACKAGE_JSON } from "./typecheck.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where to look for `vue-tsc` and `svelte-check`.
 *
 * They are devDependencies of the packages that need them (`packages/vue`,
 * `test-apps/svelte`), not of the root, so a plain `createRequire` from this
 * file misses them under pnpm's isolated layout. The list is tried in order and
 * the first hit wins; when nothing hits, the SFC pass reports itself absent
 * rather than passing silently — a checker that did not run must never look like
 * a checker that found nothing.
 */
export function toolSearchRoots(sdkRoot) {
  const repoRoot = path.resolve(HERE, "..", "..");
  return [
    sdkRoot,
    repoRoot,
    path.join(repoRoot, "packages", "vue"),
    path.join(repoRoot, "packages", "plugin-in-context-editor"),
    path.join(repoRoot, "test-apps", "svelte"),
    path.join(repoRoot, "test-apps", "vue"),
    HERE,
  ];
}

/** The absolute path of a CLI's entry script, or `null` when it is not installed. */
export function resolveTool(name, roots) {
  for (const root of roots) {
    try {
      const require_ = createRequire(path.join(root, "package.json"));
      const manifestPath = require_.resolve(`${name}/package.json`);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name];
      if (!bin) continue;
      return path.join(path.dirname(manifestPath), bin);
    } catch {
      // Not installed under this root; try the next.
    }
  }
  return null;
}

/** Copy the fixture tree into a project directory, never over a page's own file. */
function copyFixtures(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "README.md") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyFixtures(source, target);
    } else if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  }
}

/**
 * The tsconfig the SFC checkers read.
 *
 * Deliberately the same shape as `compilerOptions()` in the memory driver —
 * `strict`, `jsx: react-jsx`, `bundler`, the three path aliases — because a
 * `.vue` fence held to a laxer standard than the `.ts` fence beside it produces
 * a green page whose two halves were never checked the same way. `node16` is not
 * repeated here: it is a resolution question, and the answer for a `.vue` file
 * is the same as for the `.ts` file that imports it, which the memory driver
 * already asked.
 */
function tsconfigFor(projectDirs) {
  return {
    compilerOptions: {
      strict: true,
      jsx: "react-jsx",
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      paths: Object.fromEntries(
        projectDirs.flatMap((dir) => [
          [`@/*`, [`./${dir}/src/*`, `./${dir}/*`]],
          [`~/*`, [`./${dir}/src/*`, `./${dir}/*`]],
          [`$lib/*`, [`./${dir}/src/lib/*`]],
        ]),
      ),
    },
    include: projectDirs.map((dir) => `${dir}/**/*`),
  };
}

/** Relative `.json` specifiers a file imports, static or dynamic. */
const JSON_IMPORT = /(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']*\.json)["']/g;

/**
 * Materialise the catalogs the memory driver synthesises.
 *
 * The in-memory host answers any unclaimed `.json` with a stand-in catalog
 * (`SYNTHETIC_CATALOG`); on disk there is nobody to answer, so the same
 * `import de from './locales/de.json'` that passes in the TS pass fails in the
 * SFC pass with TS2307. Two halves of one gate disagreeing about the same line
 * is worse than either being wrong on its own — a reader cannot tell which half
 * to believe.
 */
function writeSyntheticCatalogs(dir, project) {
  for (const file of project.files.values()) {
    const from = path.dirname(path.join(dir, file.rel));
    for (const match of file.content.matchAll(JSON_IMPORT)) {
      const target = path.resolve(from, match[1]);
      // Never escape the project, and never overwrite a catalog the page wrote.
      if (!target.startsWith(path.resolve(dir) + path.sep)) continue;
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, SYNTHETIC_CATALOG);
    }
  }
}

/**
 * Write one page's projects to disk under `pageDir`.
 *
 * @returns a map from the written absolute path to the virtual file that made it
 */
function materialize(pageDir, projects, sdkRoot) {
  fs.mkdirSync(pageDir, { recursive: true });
  const modules = path.join(pageDir, "node_modules");
  if (!fs.existsSync(modules)) {
    fs.symlinkSync(path.join(sdkRoot, "node_modules"), modules, "junction");
  }
  fs.writeFileSync(path.join(pageDir, "package.json"), SYNTHETIC_PACKAGE_JSON);

  const written = new Map();
  const dirs = [];
  for (const project of projects) {
    const dir = path.join(pageDir, project.id);
    dirs.push(project.id);
    for (const file of project.files.values()) {
      const target = path.join(dir, file.rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content);
      written.set(path.resolve(target), file);
    }
    copyFixtures(FIXTURE_ROOT, dir);
    // SvelteKit's `./$types` is reached through `rootDirs` in a real project;
    // here the stub is simply dropped beside the routes that import it. Copying
    // beats `rootDirs` because a page's projects share one tsconfig, and a
    // `rootDirs` entry per project would let one tab's routes resolve another
    // tab's — the exact pooling this lot spent a review closing.
    const routes = path.join(dir, "src", "routes");
    if (fs.existsSync(routes)) {
      fs.copyFileSync(
        path.join(FIXTURE_ROOT, ".svelte-kit", "types", "src", "routes", "$types.d.ts"),
        path.join(routes, "$types.d.ts"),
      );
    }
    writeSyntheticCatalogs(dir, project);
  }
  fs.writeFileSync(path.join(pageDir, "tsconfig.json"), JSON.stringify(tsconfigFor(dirs), null, 2));
  return written;
}

/**
 * `path(line,col): error TS1234: message` — tsc's non-pretty form, which vue-tsc
 * inherits verbatim.
 */
export function parseVueTscOutput(text, cwd) {
  const out = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+TS(\d+):\s+(.*)$/);
    if (!match) continue;
    out.push({
      file: path.resolve(cwd, match[1]),
      line: Number(match[2]),
      col: Number(match[3]),
      code: Number(match[4]),
      message: match[5].trim(),
    });
  }
  return out;
}

/**
 * svelte-check `--output machine`: `<epoch-ms> ERROR "<file>" <line>:<col> "<message>"`.
 * Columns are 0-based there and 1-based everywhere else, which is the kind of
 * detail that silently shifts every reported column by one.
 */
export function parseSvelteCheckOutput(text, cwd) {
  const out = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\d+\s+ERROR\s+"([^"]*)"\s+(\d+):(\d+)\s+"([\s\S]*)"\s*$/);
    if (!match) continue;
    out.push({
      file: path.resolve(cwd, match[1]),
      line: Number(match[2]),
      col: Number(match[3]) + 1,
      code: null,
      message: match[4].replace(/\\n/g, " ").trim(),
    });
  }
  return out;
}

function run(command, args, cwd) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

/**
 * Type-check every `vue` / `svelte` fence in a set of documents.
 *
 * @param {{ sources: Map<string, string>, sdkRoot: string, keep?: boolean }} input
 * @returns {{ findings: Array<object>, stats: Array<object> }}
 */
export function sfcCheckDocuments({ sources, sdkRoot, keep = false, tmpBase = null }) {
  const findings = [];
  const stats = [];

  const pages = [];
  for (const [file, source] of sources) {
    const { fences } = extractFences(source, file);
    const { projects } = buildProjects(fences, skipCategory);
    const relevant = projects.filter((project) => project.hasVue || project.hasSvelte);
    if (relevant.length > 0) pages.push({ file, projects: relevant });
  }
  if (pages.length === 0) return { findings, stats };

  const roots = toolSearchRoots(sdkRoot);
  const vueTsc = resolveTool("vue-tsc", roots);
  const svelteCheck = resolveTool("svelte-check", roots);

  const missing = [];
  if (!vueTsc && pages.some((p) => p.projects.some((x) => x.hasVue))) missing.push("vue-tsc");
  if (!svelteCheck && pages.some((p) => p.projects.some((x) => x.hasSvelte)))
    missing.push("svelte-check");
  for (const tool of missing) {
    // Loud, and a failure. A gate that quietly checks 649 of 769 fences is worse
    // than one that checks none, because the number at the bottom says 769.
    findings.push({
      file: pages[0].file,
      line: 1,
      col: 1,
      rule: "typecheck/sfc-tool-missing",
      message:
        `${tool} is not installed under any of the search roots, so the ${tool === "vue-tsc" ? "vue" : "svelte"} ` +
        "fences were not checked. Install it, or pass --no-sfc to say the omission is deliberate.",
      migration: null,
    });
  }

  const base = tmpBase ?? fs.mkdtempSync(path.join(os.tmpdir(), "comvi-docs-sfc-"));
  try {
    for (const page of pages) {
      const slug = page.file.replace(/[^A-Za-z0-9]+/g, "_");
      const pageDir = path.join(base, slug);
      const written = materialize(pageDir, page.projects, sdkRoot);
      const stat = {
        file: page.file,
        sfcProjects: page.projects.length,
        sfc: {
          vue: [...written.values()].filter((f) => f.lang === "vue").length,
          svelte: [...written.values()].filter((f) => f.lang === "svelte").length,
        },
      };
      stats.push(stat);

      const raw = [];
      if (vueTsc && page.projects.some((project) => project.hasVue)) {
        raw.push(
          ...parseVueTscOutput(
            run(vueTsc, ["--noEmit", "--pretty", "false", "-p", "tsconfig.json"], pageDir),
            pageDir,
          ),
        );
      }
      if (svelteCheck && page.projects.some((project) => project.hasSvelte)) {
        raw.push(
          ...parseSvelteCheckOutput(
            run(
              svelteCheck,
              ["--workspace", pageDir, "--output", "machine", "--threshold", "error"],
              pageDir,
            ),
            pageDir,
          ),
        );
      }

      for (const diagnostic of raw) {
        const virtual = written.get(path.resolve(diagnostic.file));
        // A diagnostic in a fixture, a shim or a package's own `.d.ts` is not
        // the page's to fix.
        if (!virtual) continue;
        const at = mapPosition(virtual, diagnostic.line - 1, diagnostic.col - 1);
        if (virtual.fence.check.expectError) continue;
        findings.push({
          file: page.file,
          line: at.line,
          col: at.col,
          rule: "typecheck/sfc-error",
          message: diagnostic.code
            ? `TS${diagnostic.code}: ${diagnostic.message}`
            : diagnostic.message,
          migration: null,
        });
      }

      // `check=expect-error` on an SFC fence: the promised failure must happen.
      const reported = new Set(raw.map((d) => path.resolve(d.file)));
      for (const [target, virtual] of written) {
        if (!virtual.fence.check.expectError) continue;
        if (virtual.lang !== "vue" && virtual.lang !== "svelte") continue;
        if (reported.has(target)) continue;
        findings.push({
          file: page.file,
          line: virtual.fence.line,
          col: virtual.fence.col,
          rule: "typecheck/expect-error-missing",
          message: "check=expect-error says this fence must not compile, and it compiles clean.",
          migration: null,
        });
      }
    }
  } finally {
    if (!keep && !tmpBase) fs.rmSync(base, { recursive: true, force: true });
  }

  return { findings, stats };
}
