/**
 * The pure half of the docs quick-start gate: from two `.mdx` pages to one
 * build plan per framework and page. Nothing here touches the network, a disk
 * outside its arguments, or a child process — `run.mjs` does that — so every
 * decision a report rests on can be unit-tested.
 *
 * What the type-check gate (`scripts/docs-snippets`) cannot see, and this one
 * exists for: a page whose fences each compile can still describe an app that
 * does not run. A file nothing imports, a route the scaffold's router never
 * reads, a directory the framework's current template moved — all of them pass
 * `tsc` fence by fence and fail the reader at `npm run dev`. So the unit here is
 * the PROJECT a reader ends up with: the scaffold the page's Terminal fence
 * names, with the page's titled fences written over it.
 *
 * Fences are read with `extractFences` and file names with `titleToPath`, the
 * same two functions the snippet gate uses, so a fence the two gates disagree
 * about cannot exist.
 */

import { extractFences } from "../docs-snippets/extract.mjs";
import { titleToPath } from "../docs-snippets/project.mjs";

/** `<TabItem label>` → framework key. The order is the report's row order. */
export const FRAMEWORKS = [
  { key: "react", label: "React" },
  { key: "next", label: "Next.js" },
  { key: "vue", label: "Vue" },
  { key: "nuxt", label: "Nuxt" },
  { key: "svelte", label: "Svelte" },
  { key: "solid", label: "Solid" },
  { key: "vanilla", label: "Vanilla" },
];

const LABEL_TO_KEY = new Map(FRAMEWORKS.map((fw) => [fw.label, fw.key]));

/** The pages this gate builds, in report order. `base` is the page it extends. */
export const PAGES = [
  { key: "quick-start", file: "quick-start.mdx", base: null },
  // "Every other file from the Quick start is unchanged" — connect-comvi.mdx
  // describes a DIFF against the quick-start app, so its project is that app
  // with the connect page's fences and installs layered on top.
  { key: "connect-comvi", file: "connect-comvi.mdx", base: "quick-start" },
];

/**
 * Environment for every child process. The gate must not phone home: these are
 * the opt-outs of every tool it runs that has telemetry or an update check.
 * `CI` also stops Next and Nuxt from printing an interactive first-run notice.
 */
export const QUIET_ENV = {
  CI: "1",
  DO_NOT_TRACK: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NUXT_TELEMETRY_DISABLED: "1",
  ASTRO_TELEMETRY_DISABLED: "1",
  STORYBOOK_DISABLE_TELEMETRY: "1",
  npm_config_update_notifier: "false",
  npm_config_fund: "false",
  npm_config_audit: "false",
};

/**
 * The `<TabItem label>` each source line sits in, or `null` outside any tab.
 *
 * `extractFences` already counts tab boundaries (`fence.container`), but as an
 * opaque serial; the gate needs the NAME, because the name is what decides
 * which scaffold a fence lands in.
 */
export function tabLabels(source) {
  const labels = [null];
  let current = null;
  for (const line of source.split("\n")) {
    if (!/^\s*(?:<!--|\{\/\*)/.test(line)) {
      const open = line.match(/<TabItem\b[^>]*\blabel="([^"]+)"/);
      if (open) current = open[1];
      else if (/<\/TabItem>/.test(line)) current = null;
    }
    labels.push(current);
  }
  return labels;
}

/**
 * Split one page into per-framework plans.
 *
 * @returns {Map<string, { files: Map<string, object>, terminal: string[], notes: string[] }>}
 *   keyed by framework key. `files` maps a project-relative path to the fence
 *   that writes it; `terminal` is every line of the tab's `title="Terminal"`
 *   fences, in page order.
 */
export function planPage(source, pageKey, file = `${pageKey}.mdx`) {
  const { fences } = extractFences(source, file);
  const labels = tabLabels(source);
  const out = new Map();
  const entry = (key) => {
    if (!out.has(key)) out.set(key, { files: new Map(), terminal: [], notes: [] });
    return out.get(key);
  };

  // The frameworks this page has a tab for. A Terminal fence that sits outside
  // every tab (the shared install or run step) is part of each of their projects.
  const pageKeys = FRAMEWORKS.map((fw) => fw.key).filter((key) =>
    labels.some((label) => label && LABEL_TO_KEY.get(label) === key),
  );

  for (const fence of fences) {
    const label = labels[fence.line];
    const key = label ? LABEL_TO_KEY.get(label) : null;
    const isTerminal = fence.lang === "bash" && fence.title === "Terminal";

    if (isTerminal && label === null) {
      const lines = fence.lines.map((line) => line.text).filter((t) => t.trim());
      for (const pageKey of pageKeys) entry(pageKey).terminal.push(...lines);
      continue;
    }
    if (!key) continue;
    const plan = entry(key);

    if (isTerminal) {
      plan.terminal.push(...fence.lines.map((line) => line.text).filter((t) => t.trim()));
      continue;
    }
    const rel = titleToPath(fence.title);
    if (!rel) continue;

    // The group id is the snippet gate's name for the same app. A fence whose
    // group names another framework is in the wrong tab, or has the wrong id,
    // and either way the two gates are no longer checking the same project.
    const group = fence.check.group;
    if (group && !group.startsWith(`${pageKey}-${key}-`)) {
      plan.notes.push(
        `${file}:${fence.line} \`${fence.title}\` sits in the ${label} tab but carries check=group=${group}`,
      );
    }
    if (plan.files.has(rel)) {
      plan.notes.push(
        `${file}:${fence.line} \`${fence.title}\` is written twice in the ${label} tab; the later fence wins`,
      );
    }
    plan.files.set(rel, { rel, content: `${fence.code}\n`, line: fence.line, page: file });
  }
  return out;
}

/** Split a Terminal fence's lines into simple commands (`a && b` is two). */
export function splitCommands(lines) {
  const out = [];
  for (const line of lines) {
    const stripped = line.replace(/\s+#.*$/, "").trim();
    if (!stripped || stripped.startsWith("#")) continue;
    for (const part of stripped.split("&&")) {
      const command = part.trim();
      if (command) out.push(command.split(/\s+/));
    }
  }
  return out;
}

/**
 * The scaffolders the pages may name, and the flags that make each one run
 * without a prompt.
 *
 * Only NON-INTERACTIVE flags are added, and each answers a prompt with the
 * answer a reader pressing Enter would give — the scaffold the gate builds is
 * the scaffold the page's reader gets. Where a tool has no single "accept the
 * defaults" flag, the answers are spelled out and the reason is in `note`.
 */
export const SCAFFOLDERS = [
  {
    match: (argv) => isCreate(argv, "vite"),
    // `--no-interactive` alone: create-vite then neither prompts nor runs the
    // "install and start now?" step, which would start a dev server and hang.
    flags: ["--no-interactive"],
    note: "create-vite: --no-interactive (no prompt, no install-and-start)",
  },
  {
    match: (argv) => isCreate(argv, "create-next-app"),
    // `--yes` takes the defaults for every unanswered prompt. It also reads the
    // SAVED preferences of whoever ran create-next-app last on this machine, so
    // `run.mjs` points HOME at an empty directory for this step.
    flags: ["--yes", "--skip-install", "--disable-git"],
    note: "create-next-app: --yes (defaults, empty HOME so no saved preferences) --skip-install --disable-git",
  },
  {
    match: (argv) => isCreate(argv, "nuxt"),
    // create-nuxt has no "defaults" flag. `minimal` is the template its prompt
    // pre-selects; no modules and no git are what Enter answers.
    flags: [
      "--template",
      "minimal",
      "--packageManager",
      "npm",
      "--no-install",
      "--gitInit=false",
      "--no-modules",
    ],
    note: "create-nuxt: --template minimal --packageManager npm --no-install --gitInit=false --no-modules",
  },
  {
    match: (argv) => argv[0] === "npx" && argv.includes("sv") && argv.includes("create"),
    // sv's first choice for each prompt: the minimal SvelteKit template,
    // TypeScript syntax, no add-ons.
    flags: ["--template", "minimal", "--types", "ts", "--no-add-ons", "--no-install"],
    note: "sv create: --template minimal --types ts --no-add-ons --no-install",
  },
];

/**
 * The scaffold each framework's project starts from when the page shows no
 * scaffold command of its own (the quick start only says `npm install`, for an
 * app the reader already has). A scaffold on the page wins over this table.
 */
export const DEFAULT_SCAFFOLDS = {
  react: "npm create vite@latest my-app -- --template react-ts",
  next: "npx create-next-app@latest my-app --src-dir",
  vue: "npm create vite@latest my-app -- --template vue-ts",
  nuxt: "npm create nuxt@latest my-app",
  svelte: "npx sv create my-app",
  solid: "npm create vite@latest my-app -- --template solid-ts",
  vanilla: "npm create vite@latest my-app -- --template vanilla-ts",
};

/** `npm create <name>[@v]`, `npm init <name>`, or `npx [create-]<name>[@v]`. */
function isCreate(argv, name) {
  const pkgName = (spec) => spec?.replace(/@[^@/]*$/, "");
  if (argv[0] === "npm" && (argv[1] === "create" || argv[1] === "init")) {
    const target = pkgName(argv[2]);
    return (
      target === name || target === `create-${name}` || target === name.replace(/^create-/, "")
    );
  }
  if (argv[0] === "npx") {
    const spec = argv.slice(1).find((arg) => !arg.startsWith("-"));
    const target = pkgName(spec);
    return target === name || target === `create-${name}`;
  }
  return false;
}

/**
 * The scaffold command with its non-interactive flags.
 *
 * `npm create x -- <args>` forwards everything after `--`; with no `--` in the
 * fence, one is added so the flags reach the scaffolder rather than npm.
 *
 * @returns {{ argv: string[], dir: string, note: string }}
 */
export function nonInteractive(argv) {
  const scaffolder = SCAFFOLDERS.find((entry) => entry.match(argv));
  if (!scaffolder) throw new Error(`no non-interactive mapping for \`${argv.join(" ")}\``);
  const out = [...argv];
  if (out[0] === "npm" && !out.includes("--")) out.push("--");
  if (out[0] === "npx" && out[1] !== "--yes") out.splice(1, 0, "--yes");
  out.push(...scaffolder.flags);
  return { argv: out, dir: scaffoldDir(argv), note: scaffolder.note };
}

/** The directory the scaffold creates: the first positional after the tool. */
function scaffoldDir(argv) {
  const start = argv[0] === "npm" ? 3 : argv.findIndex((arg) => /create/.test(arg)) + 1;
  for (let index = start; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") break;
    if (!arg.startsWith("-")) return arg;
  }
  throw new Error(`\`${argv.join(" ")}\` names no project directory`);
}

/**
 * Turn a tab's Terminal lines into a scaffold step and a dependency list.
 *
 * Every line must be understood. A line the gate cannot classify is an error,
 * not a skip: a page that grows a `npx some-codegen` step the gate ignored
 * would be "verified" without the step a reader has to run.
 */
export function parseTerminal(lines) {
  const plan = { scaffold: null, installs: [], unknown: [] };
  for (const argv of splitCommands(lines)) {
    if (argv[0] === "cd") continue;
    // The reader's "start it" step; the gate builds and serves the app itself.
    if (argv[0] === "npm" && argv[1] === "run" && argv[2] === "dev" && argv.length === 3) continue;
    if (argv[0] === "npm" && (argv[1] === "install" || argv[1] === "i" || argv[1] === "add")) {
      plan.installs.push(...argv.slice(2).filter((arg) => !arg.startsWith("-")));
      continue;
    }
    if (SCAFFOLDERS.some((entry) => entry.match(argv))) {
      if (plan.scaffold) plan.unknown.push(argv.join(" "));
      else plan.scaffold = nonInteractive(argv);
      continue;
    }
    plan.unknown.push(argv.join(" "));
  }
  return plan;
}

/** The placeholder every CDN fence on the site uses. */
export const CDN_PLACEHOLDER = "https://cdn.comvi.io/<project-token>";

/**
 * Point the page's CDN URL at the gate's local server.
 *
 * `count` is reported so a page that renames the placeholder fails loudly
 * instead of building an app that fetches from production.
 */
export function substituteCdn(content, url) {
  const parts = content.split(CDN_PLACEHOLDER);
  const replaced = parts.join(url);
  const stray = /https?:\/\/cdn\.comvi\.io\b/.test(replaced);
  return { content: replaced, count: parts.length - 1, stray };
}

/**
 * The catalog the local CDN serves, in the platform's layout
 * (`{cdnUrl}/{locale}.json` for the default namespace).
 *
 * The wording differs from the quick-start's inline catalog on purpose: an app
 * that renders "Hello from the CDN" provably got it from the CDN, while one
 * that renders "Hello, Alice!" is still reading the inline catalog the page
 * said to replace.
 */
export const CDN_CATALOG = {
  en: {
    greeting: "Hello from the CDN, {name}!",
    items: "{count, plural, one {# item} other {# items}}",
  },
  uk: {
    greeting: "Привіт з CDN, {name}!",
    items:
      "{count, plural, one {# елемент} few {# елементи} many {# елементів} other {# елемента}}",
  },
};

/**
 * What the running app must show, and where to look for it.
 *
 * Vanilla renders nothing — its page promises a `console.log` — so its text is
 * looked for in the console as well as on the page. Next's routes live under
 * `[locale]`, so its page is `/en`.
 */
export function expectation(fw, page) {
  const cdn = page === "connect-comvi";
  if (fw === "vanilla") {
    return {
      path: "/",
      text: cdn ? "Привіт з CDN, Аліса!" : "Привіт, Аліса!",
      where: "page text or console",
    };
  }
  return {
    path: fw === "next" ? "/en" : "/",
    text: cdn ? "Hello from the CDN, Alice!" : "Hello, Alice!",
    where: "page text",
  };
}

/**
 * The commands that build, type-check and serve each framework's scaffold.
 * `serve` gets the port and returns argv + env.
 */
export const TOOLCHAIN = {
  react: viteKind("tsc"),
  vue: viteKind("vue-tsc"),
  solid: viteKind("tsc"),
  vanilla: viteKind("tsc"),
  svelte: {
    build: ["run", "build"],
    typecheck: ["run", "check"],
    serve: (port) => ({
      argv: ["exec", "vite", "preview", "--port", `${port}`, "--strictPort", "--host", "127.0.0.1"],
      env: {},
    }),
    extraDevDeps: {},
  },
  next: {
    build: ["run", "build"],
    typecheck: ["exec", "tsc", "--noEmit"],
    serve: (port) => ({
      argv: ["exec", "next", "start", "-p", `${port}`, "-H", "127.0.0.1"],
      env: {},
    }),
    extraDevDeps: {},
  },
  nuxt: {
    build: ["run", "build"],
    typecheck: ["exec", "nuxt", "typecheck"],
    serve: (port) => ({
      // `nuxi preview` has no `--host`: a stray value becomes ROOTDIR and the
      // server looks for `.output/nitro.json` in a directory named 127.0.0.1.
      argv: ["exec", "nuxt", "preview", "--port", `${port}`],
      env: { PORT: `${port}`, HOST: "127.0.0.1", NITRO_PORT: `${port}`, NITRO_HOST: "127.0.0.1" },
    }),
    // `nuxt typecheck` installs these on the fly with npx when they are missing,
    // which is a registry fetch in the middle of a gate. A reader who runs it
    // gets the same two packages; installing them up front only moves the fetch.
    extraDevDeps: { "vue-tsc": "^3.0.0", typescript: "^5.9.0" },
  },
};

function viteKind(checker) {
  return {
    build: ["run", "build"],
    typecheck: ["exec", checker, "-b"],
    serve: (port) => ({
      argv: ["exec", "vite", "preview", "--port", `${port}`, "--strictPort", "--host", "127.0.0.1"],
      env: {},
    }),
    extraDevDeps: {},
  };
}

/** Strip ANSI colour and cursor sequences so a report line is plain text. */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");
}

/**
 * The line of a failed step's output a reader should see first: the first one
 * that says error, or the last line when none does.
 */
export function firstFailingLine(output) {
  const lines = stripAnsi(output ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const hit = lines.find(
    (line) =>
      /\berror\b|ERR_|ERR!|\bfailed\b|✘|✖|Cannot find|not found|does not exist/i.test(line) &&
      !/^\s*(?:warn|warning)\b/i.test(line),
  );
  const chosen = hit ?? lines.at(-1) ?? "";
  return chosen.length > 220 ? `${chosen.slice(0, 217)}...` : chosen;
}

/**
 * The page fence a failing line is about, when the line names a file the gate
 * wrote. A report row then points at the `.mdx` line a docs author edits.
 */
export function fenceForLine(line, files) {
  let best = null;
  for (const file of files.values()) {
    if (!line.includes(file.rel)) continue;
    if (!best || file.rel.length > best.rel.length) best = file;
  }
  return best ? `${best.page}:${best.line} (${best.rel})` : null;
}

const STEPS = ["scaffold", "install", "build", "typecheck", "render"];

/** The result table, one row per framework × page. */
export function renderTable(results) {
  const header = ["framework", "page", ...STEPS];
  const rows = results.map((result) => [
    result.fw,
    result.page,
    ...STEPS.map((step) => result.steps[step]?.status ?? "-"),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  const out = [line(header), `|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`];
  for (const row of rows) out.push(line(row));

  const failures = [];
  for (const result of results) {
    for (const step of STEPS) {
      const entry = result.steps[step];
      if (entry?.status !== "fail") continue;
      const where = entry.fence ? ` [${entry.fence}]` : "";
      failures.push(`- ${result.fw} / ${result.page} / ${step}: ${entry.line}${where}`);
    }
  }
  if (failures.length > 0) out.push("", "First failing line per step:", ...failures);
  return out.join("\n");
}
