/**
 * Per-page type-check driver for the docs snippet gate (lot D2b).
 *
 * `lint.mjs` answers "does the page name the right symbols". This answers "would
 * the code the page shows compile in the reader's editor", which is the other
 * half and the cheaper one to get wrong.
 *
 * Why the TypeScript compiler API rather than shelling out to `tsc`:
 *
 *   - **One program per page.** Eight site fences write
 *     `declare module '@comvi/core' { interface TranslationKeys … }`, and core
 *     derives `PermissiveKey = keyof TranslationKeys extends never ? string
 *     : never`. In a single corpus-wide program, one such fence turns `t(name)`
 *     into an error on all ~600 others — hundreds of baseline errors that could
 *     never be driven to zero, all of them artefacts (docs-0.5 plan §6.1.2).
 *     `tsc --noEmit` has no way to express "these files, then forget them".
 *   - **No files on disk.** A page's fences become a virtual directory tree
 *     served from memory, so nothing is written, nothing is cleaned up, and a
 *     `title="src/i18n.ts"` in one tab cannot collide with the same name in the
 *     next.
 *   - **Cross-page reuse.** The lib files and every `.d.ts` under
 *     `node_modules` are parsed once and shared by every page's program. That is
 *     the difference between a run measured in minutes and one measured in
 *     hours.
 *
 * The virtual tree is rooted INSIDE `--sdk-root`, at
 * `<sdk-root>/.comvi-docs-vfs/<page>/<project>/`. That is not cosmetic: module
 * resolution walks up from the importing file looking for `node_modules`, so a
 * root under the SDK directory makes `@comvi/core`, `react`, `vue` and their
 * types resolve by the same rules a real app uses — no `paths` entry per
 * package, no `types` list to keep in sync, and a wrong `exports` map in a
 * published package fails the docs gate too.
 *
 * Two module modes, always both. `bundler` is what a Vite or Next app sees.
 * `node16` is what a plain `"type": "module"` package sees, where the same
 * extensionless `./i18n` import is an error. Findings that appear only under
 * `node16` are reported in their own category and, by default, do not fail the
 * run: they are a property of the reader's configuration, not of the snippet,
 * and the two deserve separate budgets (§6.2, last paragraph).
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { extractFences } from "./extract.mjs";
import { skipCategory } from "./lint.mjs";
import { TS_LANGS, buildProjects, isDeclarationFile, mapPosition } from "./project.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = path.join(HERE, "fixtures");

/** Where a page's virtual tree is mounted, relative to `--sdk-root`. */
export const VFS_DIR = ".comvi-docs-vfs";

/**
 * The catalog served for any JSON a project imports but does not define.
 *
 * The pages name two dozen catalogs — `de.admin.json`, `dashboard/en.json`,
 * `en/common.json` — and a checked-in fixture per name is a list that rots. The
 * shape is what matters to the type-checker: a nested object of strings, which
 * is what `InferKeys` and `resolveJsonModule` need in order to say anything.
 */
export const SYNTHETIC_CATALOG = JSON.stringify(
  {
    hello: "Hello",
    greeting: "Hello, {name}",
    cart: { items: "{count, plural, one {# item} other {# items}}", empty: "Your cart is empty" },
    nav: { home: "Home", settings: "Settings" },
  },
  null,
  2,
);

/**
 * The manifest the virtual project sits under.
 *
 * Only `node16` reads it, and it decides everything there: with no
 * `"type": "module"` in scope, TypeScript treats every `.ts` file as CommonJS
 * and reports TS1479 on each import of an ESM-only package — a hundred
 * diagnostics that say "your fixture has no package.json", not "this snippet is
 * wrong". `"type": "module"` is also the configuration the node16 pass exists to
 * model: a plain ESM package, where `./i18n` really does need its extension.
 */
export const SYNTHETIC_PACKAGE_JSON = JSON.stringify(
  { name: "comvi-docs-snippet", type: "module", private: true },
  null,
  2,
);

/** `typescript` from the repo the module sits in — js-sdk here, www in the copy. */
export function loadTypeScript() {
  return createRequire(import.meta.url)("typescript");
}

/**
 * The two module resolutions every ts/tsx fence is compiled under.
 *
 * `strict` and `jsx: react-jsx` are not negotiable: a docs example that only
 * compiles with `strict` off is a docs example that fails in the project of
 * every reader who followed the framework's own scaffold.
 */
export function compilerOptions(ts, { mode, root }) {
  const shared = {
    strict: true,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    resolveJsonModule: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    // Every published `.d.ts` under node_modules is somebody else's problem, and
    // a docs gate that fails because `@types/react` disagrees with `solid-js`
    // reports nothing about the docs.
    skipLibCheck: true,
    // `types: []` suppresses only the AUTOMATIC global inclusion of every
    // @types package under the SDK root — an explicit `import 'node:fs'` still
    // resolves through @types/node. Without it, the union of react, vue, solid
    // and svelte globals lands in one program and they contradict each other.
    types: [],
    // No `baseUrl`: TypeScript 6 reports it as deprecated (TS5101) and 7 removes
    // it. The `paths` targets are absolute instead, which is what `baseUrl`
    // would have made them anyway.
    rootDirs: [path.join(root, "src", "routes"), path.join(root, ".svelte-kit/types/src/routes")],
    paths: {
      // Vite's `@`, Nuxt's `~`, SvelteKit's `$lib` — the three alias shapes the
      // corpus uses. Each falls back to the project root because Nuxt resolves
      // `~/lib/x` from the root while a Vite scaffold resolves `@/lib/x` from
      // `src/`, and a docs project has to be both.
      "@/*": [`${root}/src/*`, `${root}/*`],
      "~/*": [`${root}/src/*`, `${root}/*`],
      "$lib/*": [`${root}/src/lib/*`],
      $lib: [`${root}/src/lib/index.ts`, `${root}/src/lib/i18n.ts`],
    },
  };

  if (mode === "node16") {
    return {
      ...shared,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    };
  }
  return {
    ...shared,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
}

/** Path comparison the way the host's `useCaseSensitiveFileNames` says. */
function normalize(p) {
  return p.replace(/\\/g, "/");
}

/**
 * A compiler host that serves the virtual tree from memory and everything else
 * from the real disk, with parsed source files shared across pages.
 *
 * The fixture overlay is the part worth reading twice. A project asking for
 * `<root>/src/i18n.ts` gets its OWN fence if it has one; otherwise the fixture
 * of that name; otherwise, if the name looks like a catalog, a synthesised one.
 * Precedence in that order is what makes "the page defines what it shows and
 * inherits the rest" true rather than aspirational.
 */
export function createHostFactory(ts, { sdkRoot, mode }) {
  const options = compilerOptions(ts, { mode, root: sdkRoot });
  const realHost = ts.createCompilerHost(options, true);
  // Keyed by mode: the SAME `.d.ts` gets a different `impliedNodeFormat` under
  // node16 than under bundler, and a source file cached across the two carries
  // the wrong one into whichever program asks second.
  const cache = new Map();
  const fixtures = new Map();
  const vfsRoot = normalize(path.join(sdkRoot, VFS_DIR));

  const readFixture = (rel) => {
    if (fixtures.has(rel)) return fixtures.get(rel);
    const abs = path.join(FIXTURE_ROOT, rel);
    const value =
      fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs, "utf8") : null;
    fixtures.set(rel, value);
    return value;
  };

  return function createHost(project) {
    const root = normalize(path.join(vfsRoot, project.pageSlug, project.id));
    const own = new Map();
    for (const file of project.files.values()) own.set(normalize(path.join(root, file.rel)), file);

    const synthetic = new Map();
    const resolveVirtual = (fileName) => {
      const name = normalize(fileName);
      if (!name.startsWith(root + "/")) return undefined;
      const own_ = own.get(name);
      if (own_) return own_.content;
      if (synthetic.has(name)) return synthetic.get(name);

      const rel = name.slice(root.length + 1);
      const base = path.posix.basename(rel);
      // The manifest exists at the project root and NOWHERE else. Serving it at
      // every level was a real bug: node16 asks `<root>/src/package.json` first,
      // the catalog synthesiser below answered it with a translation catalog,
      // and TypeScript read a package scope with no `"type"` — so every file was
      // CommonJS and every import of an ESM-only package became TS1479. Around
      // a hundred diagnostics, none of them about the docs.
      if (base === "package.json") {
        const value = rel === "package.json" ? SYNTHETIC_PACKAGE_JSON : undefined;
        synthetic.set(name, value);
        return value;
      }
      // Configuration files are not catalogs either, and a snippet that reads
      // one wants the real shape or nothing.
      if (base === "tsconfig.json" || base === "jsconfig.json") {
        synthetic.set(name, undefined);
        return undefined;
      }
      const fixture = readFixture(rel);
      if (fixture !== null) {
        synthetic.set(name, fixture);
        return fixture;
      }
      // A catalog the project imports but nobody wrote down. Synthesising it is
      // the difference between "your example imports a file the docs never
      // show" (a real finding, once) and thirty TS2307s that bury it. Every
      // `.json` counts, not only the ones under `locales/`: the corpus writes
      // `./uk.json`, `./en/common.json` and `./locales/de.json` for the same
      // thing, and which folder a catalog sits in is the example's business.
      if (rel.endsWith(".json")) {
        synthetic.set(name, SYNTHETIC_CATALOG);
        return SYNTHETIC_CATALOG;
      }
      synthetic.set(name, undefined);
      return undefined;
    };

    const directories = new Set([root, vfsRoot]);
    for (const name of own.keys()) {
      let dir = path.posix.dirname(name);
      while (dir.length > vfsRoot.length) {
        directories.add(dir);
        dir = path.posix.dirname(dir);
      }
    }
    // Fixture directories exist too, or `./locales/en.json` resolution gives up
    // before it ever asks for the file.
    for (const rel of [
      "src",
      "src/lib",
      "src/i18n",
      "src/types",
      "src/locales",
      "types",
      "locales",
      ".svelte-kit/types/src/routes",
    ]) {
      directories.add(`${root}/${rel}`);
    }

    const host = {
      ...realHost,
      getCurrentDirectory: () => root,
      getCanonicalFileName: (f) => (realHost.useCaseSensitiveFileNames() ? f : f.toLowerCase()),
      getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate) {
        const virtual = resolveVirtual(fileName);
        if (virtual !== undefined) {
          return ts.createSourceFile(fileName, virtual, languageVersionOrOptions, true);
        }
        const key = normalize(fileName);
        if (cache.has(key)) return cache.get(key);
        const parsed = realHost.getSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreate,
        );
        cache.set(key, parsed);
        return parsed;
      },
      fileExists(fileName) {
        if (normalize(fileName).startsWith(root + "/"))
          return resolveVirtual(fileName) !== undefined;
        return realHost.fileExists(fileName);
      },
      readFile(fileName) {
        const virtual = resolveVirtual(fileName);
        if (virtual !== undefined) return virtual;
        if (normalize(fileName).startsWith(vfsRoot + "/")) return undefined;
        return realHost.readFile(fileName);
      },
      directoryExists(dirName) {
        const name = normalize(dirName).replace(/\/$/, "");
        if (!name.startsWith(vfsRoot)) return realHost.directoryExists(dirName);
        // `node_modules` inside the virtual tree must NOT exist, or resolution
        // stops here and never walks up to the SDK root where the packages are.
        if (/(^|\/)node_modules(\/|$)/.test(name)) return false;
        if (directories.has(name)) return true;
        // Any other directory under this project is reported present. The
        // fixture overlay synthesises catalogs by name, not by folder — the
        // corpus writes `./uk.json`, `./en/common.json` and
        // `./locales/de.json` for the same thing — and a directory the host
        // denies is a lookup the resolver never makes. `fileExists` stays
        // authoritative, so nothing resolves that has no content.
        return name.startsWith(root + "/") || name === root;
      },
      getDirectories(dirName) {
        if (normalize(dirName).startsWith(vfsRoot)) return [];
        return realHost.getDirectories(dirName);
      },
      // The virtual tree has no realpath; asking the OS for one throws ENOENT and
      // takes module resolution down with it. Outside the tree, the real
      // realpath still matters — pnpm's node_modules is a forest of symlinks.
      realpath: (fileName) =>
        normalize(fileName).startsWith(vfsRoot)
          ? fileName
          : (realHost.realpath?.(fileName) ?? fileName),
    };

    const rootNames = [...own.entries()]
      .filter(([, file]) => TS_LANGS.has(file.lang) || isDeclarationFile(file.rel))
      .map(([name]) => name);
    // The SFC shims are a root of every project: a `.tsx` fence importing
    // `./App.vue` is checked by tsc, which cannot parse an SFC, and without the
    // ambient `declare module "*.vue"` it fails on the boundary rather than on
    // its own code. vue-tsc sees the real component (sfc-check.mjs).
    rootNames.push(`${root}/src/shims.d.ts`);

    return { host, options, root, own, rootNames };
  };
}

/** `error TS2345` → `2345`; used to match `check=expect-error=TS2345`. */
function parseExpectedCode(raw) {
  if (!raw) return null;
  const match = String(raw).match(/^(?:TS)?(\d+)$/i);
  return match ? Number(match[1]) : null;
}

/**
 * Compile one project and return every diagnostic mapped back to the source.
 *
 * Diagnostics that land in a fixture or in `node_modules` are dropped, not
 * reported: the fence under test did not write them, and a reader cannot fix
 * them. Diagnostics with no file at all — bad options, a missing lib — belong to
 * the page and land on line 1.
 */
function checkProject(ts, createHost, project, pageFile) {
  const { host, options, own, rootNames } = createHost(project);
  const program = ts.createProgram({ rootNames, options, host });
  const raw = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];

  const out = [];
  for (const diagnostic of raw) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (!diagnostic.file) {
      out.push({
        file: pageFile,
        line: 1,
        col: 1,
        code: diagnostic.code,
        message,
        fence: null,
        virtual: null,
      });
      continue;
    }
    const virtual = own.get(normalize(diagnostic.file.fileName));
    // Not one of the page's own files: a fixture, a shim, or a package's
    // `.d.ts`. Nothing the page's author can act on.
    if (!virtual) continue;

    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0,
    );
    const at = mapPosition(virtual, line, character);
    out.push({
      file: pageFile,
      line: at.line,
      col: at.col,
      code: diagnostic.code,
      message,
      fence: virtual.fence,
      virtual: virtual.rel,
    });
  }
  return out;
}

/** A diagnostic's identity for the bundler-vs-node16 comparison. */
function diagnosticKey(diagnostic) {
  return `${diagnostic.line}:${diagnostic.col}:${diagnostic.code}`;
}

/**
 * Apply `check=expect-error` to one project's diagnostics.
 *
 * A fence marked `expect-error` is a fence the docs show in order to say "this
 * does not compile" — `features.mdx:178`, `type-safety.mdx:18`,
 * `pluralization.mdx:414`. Under `check=skip` those rot first, because nothing
 * notices when the error they promise stops happening. So the assertion runs in
 * both directions: the error must occur, and — when the meta names a code — it
 * must be that error and not a typo that happens to also fail.
 */
export function applyExpectError(diagnostics, projects) {
  const kept = [];
  const findings = [];
  const byFence = new Map();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fence) {
      kept.push(diagnostic);
      continue;
    }
    const list = byFence.get(diagnostic.fence) ?? [];
    list.push(diagnostic);
    byFence.set(diagnostic.fence, list);
  }

  const expectant = new Set();
  for (const project of projects) {
    for (const file of project.files.values()) {
      if (file.fence.check.expectError) expectant.add(file.fence);
    }
  }

  for (const [fence, list] of byFence) {
    if (!fence.check.expectError) {
      kept.push(...list);
      continue;
    }
    const expected = parseExpectedCode(fence.check.errorCode);
    if (expected !== null && !list.some((d) => d.code === expected)) {
      findings.push({
        file: list[0].file,
        line: fence.line,
        col: fence.col,
        rule: "typecheck/expect-error-wrong-code",
        message:
          `check=expect-error=TS${expected}, but this fence reports ` +
          `${[...new Set(list.map((d) => `TS${d.code}`))].join(", ")} instead. ` +
          "Either the example drifted, or the code in the meta did.",
        migration: null,
      });
    }
  }

  for (const fence of expectant) {
    if (byFence.has(fence)) continue;
    findings.push({
      file: null,
      line: fence.line,
      col: fence.col,
      rule: "typecheck/expect-error-missing",
      message:
        "check=expect-error says this fence must not compile, and it compiles clean. " +
        "The API it demonstrates as wrong has become valid, or the fence lost the part that broke it.",
      migration: null,
    });
  }

  return { kept, findings };
}

/**
 * Type-check one document.
 *
 * @param {{ file: string, source: string, context: object }} input
 * @returns {{ findings: Array<object>, stats: object }}
 */
export function typecheckDocument({ file, source, context }) {
  const { ts, hosts } = context;
  const { fences } = extractFences(source, file);
  const { projects, skips } = buildProjects(fences, skipCategory);
  const pageSlug = file.replace(/[^A-Za-z0-9]+/g, "_");

  const findings = [];
  const stats = {
    file,
    projects: 0,
    files: 0,
    checkedFences: 0,
    skips,
    diagnostics: 0,
    node16Only: 0,
  };

  for (const project of projects) {
    project.pageSlug = pageSlug;
    stats.files += project.files.size;
    for (const f of project.files.values()) {
      // vue/svelte files are written into the project so the ts fences can
      // import them, but they are COUNTED by sfc-check.mjs, which is what
      // actually checks them. Counting them here too would report every SFC
      // fence twice in one summary.
      if (TS_LANGS.has(f.lang)) stats.checkedFences += 1;
    }
    if (!project.hasTs) continue;
    stats.projects += 1;

    const bundler = checkProject(ts, hosts.bundler, project, file);
    const node16 = checkProject(ts, hosts.node16, project, file);

    const seen = new Set(bundler.map(diagnosticKey));
    const only16 = node16.filter((d) => !seen.has(diagnosticKey(d)));

    const resolved = applyExpectError([...bundler], [project]);
    findings.push(...resolved.findings.map((f) => ({ ...f, file: f.file ?? file })));
    for (const diagnostic of resolved.kept) {
      findings.push({
        file: diagnostic.file,
        line: diagnostic.line,
        col: diagnostic.col,
        rule: "typecheck/error",
        message: `TS${diagnostic.code}: ${diagnostic.message}`,
        migration: null,
      });
    }
    stats.diagnostics += resolved.kept.length;

    const only16Resolved = applyExpectError(only16, [project]);
    for (const diagnostic of only16Resolved.kept) {
      findings.push({
        file: diagnostic.file,
        line: diagnostic.line,
        col: diagnostic.col,
        rule: "typecheck/node16-only",
        // Advisory, not a failure: this is a fact about the reader's tsconfig,
        // not about the snippet. A gate that fails on it fails on every
        // extensionless relative import in the corpus, which is all of them.
        advisory: true,
        message: `TS${diagnostic.code} under moduleResolution=node16 only: ${diagnostic.message}`,
        migration: null,
      });
    }
    stats.node16Only += only16Resolved.kept.length;
  }

  return { findings, stats };
}

/**
 * The state shared by every page in one run: the compiler, and one host factory
 * per module mode holding the parsed lib and `node_modules` files.
 */
export function createTypecheckContext({ sdkRoot, ts = loadTypeScript() }) {
  const resolved = path.resolve(sdkRoot);
  if (!fs.existsSync(path.join(resolved, "node_modules"))) {
    throw new Error(
      `--sdk-root ${resolved} has no node_modules. ` +
        "Point it at a directory where @comvi/* and the framework types are installed " +
        "(scripts/docs-snippets/link-sdk.mjs prints one built from the workspace).",
    );
  }
  return {
    ts,
    sdkRoot: resolved,
    hosts: {
      bundler: createHostFactory(ts, { sdkRoot: resolved, mode: "bundler" }),
      node16: createHostFactory(ts, { sdkRoot: resolved, mode: "node16" }),
    },
  };
}
