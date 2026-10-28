// IDE bench of the typed `t()` and `<T>` (design rev 3 R3-19): a REAL tsserver, driven
// over its stdio protocol, on generated projects of 5k / 20k / 50k keys in 2 and 20
// namespaces — the editor experience that makes developers switch translation typing off
// when it lags.
//
//   node scripts/types-bench/ide.mjs [--rounds 3]        gate run (pnpm check:types-ide)
//   node scripts/types-bench/ide.mjs --red <variant>     the same gates over a planted
//                                                        regression (see REDS); exits 0
//                                                        only if EVERY gate the variant
//                                                        exists for fails
//   node scripts/types-bench/ide.mjs --ts <dir>          another TypeScript (its package
//                                                        directory), e.g. the latest stable
//   --sizes 5000,50000  --ns 2  narrow the matrix (a quick look; the gates need 5k and 50k)
//
// Each project is lib.ts (packages/core/src/types.ts verbatim + two factories, as in
// gen.mjs), jsxlib.ts (the React binding's `<T>` types over @types/react, gen.mjs JSX_LIB),
// comvi.d.ts written by typegen's real emitter — every namespace with keys of its own
// (`s…` default, `p…` shop, `n<i>_…` the others), so a list from the wrong namespace is
// told apart — and app.tsx: 30 calls across namespaces, a call of `zz.added` (a key only
// the regenerated declaration has), one `<T>` element and the completion sites. Per round,
// after a warm-up check of app.tsx:
//
//   (a1) completions at t("|            (a2) at useI18n("shop").t("|
//   (a3) completions inside the params object of t("key", { | })
//   (a4) the same for a key whose params all have defaults (all optional)
//   (b)  quickinfo (hover) on t in t("key", …)
//   (c)  semantic diagnostics of app.tsx after an edit of one call
//   (c2) the same after an edit that makes the key a typo (R3-2's editor symptom)
//   (j)  the same after an edit that makes the `<T i18nKey>` a typo (lot 3 review, BLOCK 1)
//   (d)  semantic diagnostics after comvi.d.ts is regenerated: round 0 adds `zz.added`
//        (its call goes from an error to valid), round 1 takes it out again (back to an
//        error), and so on
//   (e)  tsserver memory after every request, after a full GC
//
// BLOCKING gates COUNT work (ide-count.cjs: instantiations, types created, union inputs,
// relation-stack checks per request — deterministic for a pinned TypeScript, the same on a
// laptop and a CI runner) and never read a clock. Each has an ID; a red variant names the
// IDs it must fail:
//   - complete:a1/a2 — exactly the namespace's key SET (names compared, not counted);
//     complete:a3/a4 — exactly the key's params and ns/locale/markers;
//   - hover — names the key and its param;
//   - diag:c/c2/j/d — diagnostics on exactly the expected lines in every round: the three
//     unfinished probe lines, the `zz.added` call while the declaration lacks it, the typo
//     line (TS2345 for t(), TS2322 for <T>) — a server that resolves nothing, or never
//     sees the regenerated file, fails here instead of passing every count;
//   - scale:<op>:<inst|union|types> — counted scaling 5k → 50k ≤ 1.5× for every
//     operation. A new program (c, c2, j, d) builds each namespace's key literals and key
//     union ONCE: union inputs and types created are gated BEYOND `keys per namespace ×
//     namespaces the file uses` (the catalog, not the calls);
//   - workcap — no request reaches the counted work cap (ide-count.cjs);
//   - mem:rss — the largest RSS over all measured operations, minus a 100-key project's
//     tsserver (~230 MB: TypeScript itself), ≤ 400 MB (R3-19, clarified 28.10);
//   - mem:committed — the largest V8 committed heap + external over all measured
//     operations ≤ 400 MB.
// INFORMATIONAL: milliseconds per request inside tsserver, median of the rounds (target:
// completions @50k < 100 ms), with node and TypeScript versions. Never failing.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  emitProbe,
  JSX_LIB,
  JSX_OPTIONS,
  keyList,
  probeSchema,
  ROOT,
  TYPES_SOURCE,
} from "./gen.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const rounds = Number(opt("--rounds", 3));
const sizes = opt("--sizes", "5000,20000,50000").split(",").map(Number);
const nsCounts = opt("--ns", "2,20").split(",").map(Number);
const tsDir = path.resolve(opt("--ts", path.join(ROOT, "node_modules/typescript")));
const TSSERVER = path.join(tsDir, "lib/tsserver.js");
// TypeScript 7 (the native port) has no tsserver.js: it speaks LSP (`tsc --lsp --stdio`).
// Its checker is Go, so nothing can be counted: the LSP mode prints milliseconds, the
// completion lists and the process RSS, and gates only the lists and diagnostics.
const LSP = !fs.existsSync(TSSERVER);
const tsVersion = JSON.parse(fs.readFileSync(path.join(tsDir, "package.json"), "utf8")).version;
if (
  !fs.existsSync(path.join(tsDir, "lib/tsserver.js")) &&
  !fs.existsSync(path.join(tsDir, "bin/tsc"))
)
  throw new Error(`--ts ${tsDir}: neither lib/tsserver.js nor bin/tsc`);

const GATES = { scaling: 1.5, rssGrowthMB: 400, committedMB: 400 };

const LIB_TAIL = `
export declare function createI18n(o: { locale: string }): { t: TFor };
export declare function useI18n<NS extends string = "default">(ns?: NS): { t: TFor<NS> };
`;

// Red variants: each plants one known regression — into types.ts (`types`), the factories
// (`lib`), the declaration (`dts`) or the bench's own regeneration step (`staleRegen`) —
// and names the gate IDs it exists for. The run exits 0 only if EVERY one of them fails
// (a gate never seen red is unverified; "some gate failed" proves nothing).
const REDS = {
  // The key union rebuilt per call: `keyof Catalogs[N]` instead of the cached KeysOf[N].
  keyof: {
    gates: ["scale:a3:union", "scale:c:union"],
    types: [
      [
        "  K extends KeysOf[N] | NotAKey,\n  N extends NsOf = NS,",
        "  K extends keyof Catalogs[N] | NotAKey,\n  N extends NsOf = NS,",
      ],
      [
        "export type ParamsFor<N extends NsOf, K extends KeysOf[N] | NotAKey>",
        "export type ParamsFor<N extends NsOf, K extends keyof Catalogs[N] | NotAKey>",
      ],
    ],
  },
  // Recursive template-literal path types (split a key on "." and join it back), as
  // nested-catalog libraries type their keys.
  paths: {
    gates: ["scale:c:inst", "scale:c:types"],
    types: [
      [
        "export type KeysOf = { [N in NsOf]: keyof Catalogs[N] };",
        "type Split<S extends string> = S extends `${infer H}.${infer R}` ? [H, ...Split<R>] : [S];\n" +
          "type Join<T> = T extends [infer H extends string, ...infer R] ? (R extends [] ? H : `${H}.${Join<R>}`) : never;\n" +
          "export type KeysOf = { [N in NsOf]: { [K in keyof Catalogs[N] & string]: Join<Split<K>> }[keyof Catalogs[N] & string] };",
      ],
    ],
  },
  // An extra per-call option in the params object: the (a3)/(a4) exact-set gates.
  option: {
    gates: ["complete:a3", "complete:a4"],
    types: [
      [
        "? [params?: P & { ns?: N; locale?: string; markers?: boolean }]",
        "? [params?: P & { ns?: N; locale?: string; markers?: boolean; debug?: boolean }]",
      ],
      [
        ": [params: P & { ns?: N; locale?: string; markers?: boolean }];",
        ": [params: P & { ns?: N; locale?: string; markers?: boolean; debug?: boolean }];",
      ],
    ],
  },
  // A declaration repeated per locale (8 of them), which R3-19 rules out: the memory gates.
  "per-locale": {
    gates: ["mem:committed", "mem:rss"],
    dts: (text) => {
      const body = text.slice(
        text.indexOf("  interface Catalogs {"),
        text.lastIndexOf("  }\n}") + 4,
      );
      const copies = ["de", "fr", "es", "it", "pt", "pl", "uk", "ja"].map((l) =>
        body.replace("interface Catalogs {", `interface Catalogs_${l} {`),
      );
      return text.replace(body, body + "\n" + copies.join("\n"));
    },
  },
  // A key of the default namespace renamed: the list has the right SIZE and a wrong name.
  "wrong-name": {
    gates: ["complete:a1"],
    dts: (text) => text.replace('"s49.k0":', '"s49.k0x":'),
  },
  // useI18n("shop").t typed by the default namespace: as many keys, another namespace's.
  "wrong-namespace": {
    gates: ["complete:a2"],
    lib: [["): { t: TFor<NS> };", "): { t: TFor };"]],
  },
  // The regenerated comvi.d.ts never reaches tsserver (the file is sent unchanged).
  "stale-regen": { gates: ["diag:d"], staleRegen: true },
  // `<T>` without the typo guard (lot 3 review, BLOCK 1): the warm-up check of a valid
  // element already runs into the counted work cap.
  "jsx-guard": {
    gates: ["workcap"],
    types: [
      [
        'export type TComponentFor<Out> = <K extends KeysOf[N] | NotAKey, N extends NsOf = "default" & NsOf>(',
        'export type TComponentFor<Out> = <K extends KeysOf[N], N extends NsOf = "default" & NsOf>(',
      ],
      [
        "export type BoundTFor<NS extends NsOf, Out> = <K extends KeysOf[NS] | NotAKey>(",
        "export type BoundTFor<NS extends NsOf, Out> = <K extends KeysOf[NS]>(",
      ],
    ],
  },
  // Types created per new program that grow with the catalog beyond the key literals
  // (a second, decorated literal per key): the types-created gate.
  "types-per-key": {
    gates: ["scale:c:types"],
    types: [
      [
        "export type KeysOf = { [N in NsOf]: keyof Catalogs[N] };",
        "export type KeysOf = { [N in NsOf]: keyof Catalogs[N] | `${keyof Catalogs[N] & string}?` };",
      ],
    ],
  },
};
const redArg = args.indexOf("--red");
const red = redArg < 0 ? undefined : args[redArg + 1];
if (red !== undefined && !REDS[red])
  throw new Error(`--red: unknown variant "${red}" (${Object.keys(REDS).join(", ")})`);
const RED = (red && REDS[red]) || {};
const plant = (text, edits, what) => {
  for (const [from, to] of edits || []) {
    if (!text.includes(from)) throw new Error(`--red ${red}: could not plant ${what}: ${from}`);
    text = text.replace(from, to);
  }
  return text;
};
const typesSource = plant(fs.readFileSync(TYPES_SOURCE, "utf8"), RED.types, "types.ts");
const libTail = plant(LIB_TAIL, RED.lib, "the factories");
const emit = (schema) => {
  const text = emitProbe(schema);
  if (!RED.dts) return text;
  const planted = RED.dts(text);
  if (planted === text) throw new Error(`--red ${red}: could not plant the declaration change`);
  return planted;
};

const NS_NAMES = (n) => [
  "default",
  "shop",
  ...Array.from({ length: n - 2 }, (_, i) => `ns${i + 2}`),
];
/** Each namespace's own key prefix: `s0.k1` (default), `p0.k1` (shop), `n2_0.k1` (ns2). */
const prefixOf = (ns) => (ns === "default" ? "s" : ns === "shop" ? "p" : `n${ns.slice(2)}_`);
const PARAM = {
  plural: "count: 2",
  rich: "link: tag",
  dp: "name: 'x'",
  dpOnly: "",
  name: "name: 'x'",
  select: "g: 'male'",
  plain: "",
};

/** Writes a project; returns its files, the probe sites and the expected key sets. */
function project(dir, total, nsCount) {
  const nss = NS_NAMES(nsCount);
  const list = keyList(total / nsCount);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lib.ts"), typesSource + libTail);
  fs.writeFileSync(path.join(dir, "jsxlib.ts"), JSX_LIB);
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        skipLibCheck: true,
        ...JSX_OPTIONS,
      },
      include: ["*.ts", "*.tsx"],
    }),
  );
  // gen.mjs names keys `s<section>.k<j>`; each namespace gets its own prefix.
  const proto = probeSchema(["x"], list).namespaces.x;
  const namespaces = {};
  for (const ns of nss)
    namespaces[ns] = Object.fromEntries(
      Object.entries(proto).map(([k, v]) => [prefixOf(ns) + k.slice(1), v]),
    );
  // One key whose only param has a default, at every size (gen.mjs's own dpOnly keys
  // need 900 keys per namespace): the (a4) site.
  namespaces.default["opt.brand"] = { params: { brand: { kind: "string" } } };
  const schema = { v: 2, sourceLocale: "en", namespaces };
  const dts = emit(schema);
  fs.writeFileSync(path.join(dir, "comvi.d.ts"), dts);
  const L = [
    "import { createI18n, useI18n, type Tag } from './lib';",
    "import { T } from './jsxlib';",
    "const i18n = createI18n({ locale: 'en' });",
    "const t = i18n.t;",
    "declare const tag: Tag;",
    "export const out: unknown[] = [];",
    "const shop = useI18n('shop');",
  ];
  // 30 calls over the namespaces, every kind of key.
  const step = Math.floor(list.length / 30);
  const used = new Set(["default", "shop"]);
  for (let i = 0; i < 30; i++) {
    const { s, j, k } = list[i * step];
    const ns = nss[i % nss.length];
    used.add(ns);
    const params = [PARAM[k], ns === "default" ? "" : `ns: '${ns}'`].filter(Boolean).join(", ");
    L.push(`out.push(t('${prefixOf(ns)}${s}.k${j}'${params ? `, { ${params} }` : ""}));`);
  }
  // The edit (c) and hover (b) target: a `name` key ('s0.k1' ↔ 's1.k1' exist at every size).
  const editLine = L.length;
  L.push("out.push(t('s0.k1', { name: 'x' }));");
  // The key only the regenerated declaration has (d): an error until it lands.
  const added = L.length;
  L.push("out.push(t('zz.added'));");
  // The `<T>` element (j): a `name` key, made a typo and put back.
  const jsx = L.length;
  L.push("export const el = <T i18nKey='s0.k1' name='x' />;");
  const a1 = L.length;
  L.push("out.push(t(''));");
  const a2 = L.length;
  L.push("out.push(shop.t(''));");
  const a3 = L.length;
  L.push("out.push(t('s0.k1', {  }));");
  const a4 = L.length;
  L.push("out.push(t('opt.brand', {  }));");
  const app = L.join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "app.tsx"), app);
  // Protocol positions are 1-based line and offset.
  return {
    app: path.join(dir, "app.tsx"),
    dts: path.join(dir, "comvi.d.ts"),
    appText: app,
    dtsText: dts,
    keysPerNs: list.length,
    nsUsed: used.size,
    // The key sets (a1)/(a2) must list: the namespace's keys, by name.
    keys: { default: Object.keys(namespaces.default), shop: Object.keys(namespaces.shop) },
    sites: {
      a1: { line: a1 + 1, offset: "out.push(t('".length + 1 },
      a2: { line: a2 + 1, offset: "out.push(shop.t('".length + 1 },
      a3: { line: a3 + 1, offset: "out.push(t('s0.k1', { ".length + 1 },
      a4: { line: a4 + 1, offset: "out.push(t('opt.brand', { ".length + 1 },
      b: { line: editLine + 1, offset: "out.push(".length + 1 },
      // The section digit of 's0.k1' (the edit), its 'k1' (the typo edit), and the
      // element's 'k1' (the JSX typo edit).
      edit: { line: editLine + 1, offset: "out.push(t('s".length + 1 },
      typo: { line: editLine + 1, offset: "out.push(t('s0.".length + 1 },
      jsx: { line: jsx + 1, offset: "export const el = <T i18nKey='s0.".length + 1 },
      added: added + 1,
      // Lines (1-based) that are errors by construction: t(''), shop.t(''), a3's missing param.
      unfinished: [a1 + 1, a2 + 1, a3 + 1],
    },
    // A regenerated comvi.d.ts: one key more in the default namespace.
    dtsNext: emit({
      ...schema,
      namespaces: { ...namespaces, default: { ...namespaces.default, "zz.added": {} } },
    }),
  };
}

/**
 * Whether comvi.d.ts holds `zz.added` when op runs in round r: (d) of round r sends the
 * regenerated file in even rounds and the original in odd ones; everything else in round r
 * runs after round r−1's (d).
 */
const hasAdded = (op, r) => (op === "d" ? r % 2 === 0 : r % 2 === 1);

// A hang guard, not a timing gate: a type regression can send tsserver into a loop that
// never answers, and the bench would sit silent until the CI job timeout. Fail the request
// with its name instead. (The counted work cap of ide-count.cjs usually stops it first.)
const REQUEST_LIMIT_MS = Number(process.env.IDE_REQUEST_LIMIT_MS) || 180_000;
const guard = (label, promise) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new Error(
            `${label}: no answer in ${REQUEST_LIMIT_MS / 1000} s — the types probably loop (IDE_REQUEST_LIMIT_MS)`,
          ),
        ),
      REQUEST_LIMIT_MS,
    );
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

const OP_NAMES = ["a1", "a2", "a3", "a4", "b", "c", "c2", "j", "d"];
const newOps = () => Object.fromEntries(OP_NAMES.map((op) => [op, []]));

/** A tsserver over stdio, with the work counters on fd 3. */
function startServer() {
  const child = spawn(
    process.execPath,
    [
      "--expose-gc",
      // VS Code starts tsserver with --max-old-space-size=3072 (typescript.tsserver.maxTsServerMemory).
      "--max-old-space-size=3072",
      "-r",
      path.join(HERE, "ide-count.cjs"),
      TSSERVER,
      "--disableAutomaticTypingAcquisition",
      "--suppressDiagnosticEvents",
    ],
    { stdio: ["pipe", "pipe", "inherit", "pipe"] },
  );
  let seq = 0;
  const waiting = new Map();
  const counts = new Map();
  let buffer = Buffer.alloc(0);
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const header = buffer.indexOf("\r\n\r\n");
      if (header < 0) return;
      const m = /Content-Length: (\d+)/.exec(buffer.subarray(0, header).toString());
      const len = Number(m[1]);
      if (buffer.length < header + 4 + len) return;
      const msg = JSON.parse(buffer.subarray(header + 4, header + 4 + len).toString());
      buffer = buffer.subarray(header + 4 + len);
      if (msg.type === "response" && waiting.has(msg.request_seq)) {
        const done = waiting.get(msg.request_seq);
        waiting.delete(msg.request_seq);
        done(msg);
      }
    }
  });
  let side = "";
  child.stdio[3].on("data", (chunk) => {
    side += chunk.toString();
    let nl;
    while ((nl = side.indexOf("\n")) >= 0) {
      const c = JSON.parse(side.slice(0, nl));
      side = side.slice(nl + 1);
      counts.set(c.seq, c);
    }
  });
  const request = (command, args) =>
    guard(
      `tsserver ${command}`,
      new Promise((resolve, reject) => {
        const s = ++seq;
        waiting.set(s, (msg) => {
          // The counters line is written before the response, on another pipe: wait for it.
          const wait = () =>
            counts.has(s) ? resolve({ msg, work: counts.get(s) }) : setImmediate(wait);
          if (!msg.success && command !== "exit") reject(new Error(`${command}: ${msg.message}`));
          else wait();
        });
        child.stdin.write(
          JSON.stringify({ seq: s, type: "request", command, arguments: args }) + "\n",
        );
      }),
    );
  return { child, request };
}

/**
 * The operations of one project. A request that fails (the counted work cap, the hang
 * guard) ends the project's measurement: `failure` names it, the gates report it.
 */
async function measure(p) {
  const { child, request } = startServer();
  const ops = newOps();
  // Per op, per round: completion names and diagnostics ("line:TScode").
  const entries = Object.fromEntries(["a1", "a2", "a3", "a4"].map((op) => [op, []]));
  const diags = Object.fromEntries(["c", "c2", "j", "d"].map((op) => [op, []]));
  let hover = "";
  let failure;
  try {
    await request("open", { file: p.app, fileContent: p.appText, scriptKindName: "TSX" });
    await request("open", { file: p.dts, fileContent: p.dtsText, scriptKindName: "TS" });
    await request("semanticDiagnosticsSync", { file: p.app }); // warm-up
    const diagnose = async (op) => {
      const { msg, work } = await request("semanticDiagnosticsSync", { file: p.app });
      ops[op].push(work);
      diags[op].push((msg.body ?? []).map((d) => `${d.start.line}:TS${d.code}`));
    };
    const edit = ({ line }, offset, length, insertString) =>
      request("change", {
        file: p.app,
        line,
        offset,
        endLine: line,
        endOffset: offset + length,
        insertString,
      });
    for (let r = 0; r < rounds; r++) {
      for (const site of ["a1", "a2", "a3", "a4"]) {
        const { msg, work } = await request("completionInfo", { file: p.app, ...p.sites[site] });
        ops[site].push(work);
        entries[site].push((msg.body?.entries ?? []).map((e) => e.name));
      }
      const h = await request("quickinfo", { file: p.app, ...p.sites.b });
      ops.b.push(h.work);
      hover = h.msg.body?.displayString ?? "";
      // (c) edit one call ('s0.k1' ↔ 's1.k1', both `name` keys), then check the file.
      await edit(p.sites.edit, p.sites.edit.offset, 1, r % 2 ? "0" : "1");
      await diagnose("c");
      // (c2) the key becomes a typo ('s1.zz' / 's0.zz'), then is put back.
      await edit(p.sites.typo, p.sites.typo.offset, 2, "zz");
      await diagnose("c2");
      await edit(p.sites.typo, p.sites.typo.offset, 2, "k1");
      // (j) the element's key becomes a typo ('s0.zz'), then is put back.
      await edit(p.sites.jsx, p.sites.jsx.offset, 2, "zz");
      await diagnose("j");
      await edit(p.sites.jsx, p.sites.jsx.offset, 2, "k1");
      // (d) comvi.d.ts regenerated (a new key, then back), then the whole file again.
      const next = hasAdded("d", r) ? p.dtsNext : p.dtsText;
      await request("updateOpen", {
        changedFiles: [],
        openFiles: [
          { file: p.dts, fileContent: RED.staleRegen ? p.dtsText : next, scriptKindName: "TS" },
        ],
      });
      await diagnose("d");
    }
  } catch (e) {
    failure = e.message;
  } finally {
    child.stdin.end(JSON.stringify({ seq: 1e9, type: "request", command: "exit" }) + "\n");
    // A looping server never reads `exit`: stop the one we started by its own handle.
    const grace = setTimeout(() => child.kill(), 5000);
    await new Promise((r) => child.once("exit", r));
    clearTimeout(grace);
  }
  return { ops, entries, hover, diags, failure };
}

/** TypeScript 7: the same operations over LSP. Work cannot be counted; time and RSS are printed. */
async function measureLsp(p) {
  const child = spawn(process.execPath, [path.join(tsDir, "bin/tsc"), "--lsp", "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  let id = 0;
  const waiting = new Map();
  let buffer = Buffer.alloc(0);
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const header = buffer.indexOf("\r\n\r\n");
      if (header < 0) return;
      const len = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, header).toString())[1]);
      if (buffer.length < header + 4 + len) return;
      const msg = JSON.parse(buffer.subarray(header + 4, header + 4 + len).toString());
      buffer = buffer.subarray(header + 4 + len);
      if (msg.id !== undefined && msg.method === undefined && waiting.has(msg.id)) {
        waiting.get(msg.id)(msg);
        waiting.delete(msg.id);
      } else if (msg.id !== undefined && msg.method !== undefined) {
        // A server request (configuration, registration): answer with nothing.
        send({ jsonrpc: "2.0", id: msg.id, result: null });
      }
    }
  });
  const send = (m) => {
    const body = Buffer.from(JSON.stringify(m));
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  };
  const rss = () =>
    Number(execFileSync("ps", ["-o", "rss=", "-p", String(child.pid)]).toString()) * 1024;
  const request = (method, params) =>
    guard(
      `LSP ${method}`,
      new Promise((resolve, reject) => {
        const n = ++id;
        const t0 = process.hrtime.bigint();
        waiting.set(n, (msg) =>
          msg.error
            ? reject(new Error(`${method}: ${msg.error.message}`))
            : resolve({
                result: msg.result,
                work: { ms: Number(process.hrtime.bigint() - t0) / 1e6, rss: rss() },
              }),
        );
        send({ jsonrpc: "2.0", id: n, method, params });
      }),
    );
  const notify = (method, params) => send({ jsonrpc: "2.0", method, params });
  const uri = (file) => pathToFileURL(file).href;
  const pos = ({ line, offset }) => ({ line: line - 1, character: offset - 1 });
  const versions = { app: 1, dts: 1 };
  const ops = newOps();
  const entries = Object.fromEntries(["a1", "a2", "a3", "a4"].map((op) => [op, []]));
  const diags = Object.fromEntries(["c", "c2", "j", "d"].map((op) => [op, []]));
  let hover = "";
  let failure;
  try {
    await request("initialize", {
      processId: process.pid,
      rootUri: uri(path.dirname(p.app)),
      capabilities: {
        textDocument: {
          completion: { completionItem: {} },
          hover: { contentFormat: ["plaintext"] },
          diagnostic: {},
        },
      },
    });
    notify("initialized", {});
    for (const [file, text, languageId] of [
      [p.app, p.appText, "typescriptreact"],
      [p.dts, p.dtsText, "typescript"],
    ])
      notify("textDocument/didOpen", {
        textDocument: { uri: uri(file), languageId, version: 1, text },
      });
    const diagnose = async (op) => {
      const { result, work } = await request("textDocument/diagnostic", {
        textDocument: { uri: uri(p.app) },
      });
      if (!op) return;
      ops[op].push(work);
      diags[op].push((result?.items ?? []).map((d) => `${d.range.start.line + 1}:TS${d.code}`));
    };
    await diagnose(); // warm-up
    const editAt = (site, character, length, text) => {
      const at = { ...pos(site), character };
      notify("textDocument/didChange", {
        textDocument: { uri: uri(p.app), version: ++versions.app },
        contentChanges: [
          { range: { start: at, end: { ...at, character: character + length } }, text },
        ],
      });
    };
    for (let r = 0; r < rounds; r++) {
      for (const site of ["a1", "a2", "a3", "a4"]) {
        const { result, work } = await request("textDocument/completion", {
          textDocument: { uri: uri(p.app) },
          position: pos(p.sites[site]),
        });
        ops[site].push(work);
        // tsgo labels an optional member `name?`; tsserver names it `name`.
        entries[site].push(
          (Array.isArray(result) ? result : (result?.items ?? [])).map((i) =>
            i.label.replace(/\?$/, ""),
          ),
        );
      }
      const h = await request("textDocument/hover", {
        textDocument: { uri: uri(p.app) },
        position: pos(p.sites.b),
      });
      ops.b.push(h.work);
      const contents = h.result?.contents;
      hover = typeof contents === "string" ? contents : (contents?.value ?? "");
      editAt(p.sites.edit, pos(p.sites.edit).character, 1, r % 2 ? "0" : "1");
      await diagnose("c");
      editAt(p.sites.typo, p.sites.typo.offset - 1, 2, "zz");
      await diagnose("c2");
      editAt(p.sites.typo, p.sites.typo.offset - 1, 2, "k1");
      editAt(p.sites.jsx, p.sites.jsx.offset - 1, 2, "zz");
      await diagnose("j");
      editAt(p.sites.jsx, p.sites.jsx.offset - 1, 2, "k1");
      const next = hasAdded("d", r) ? p.dtsNext : p.dtsText;
      notify("textDocument/didChange", {
        textDocument: { uri: uri(p.dts), version: ++versions.dts },
        contentChanges: [{ text: RED.staleRegen ? p.dtsText : next }],
      });
      await diagnose("d");
    }
  } catch (e) {
    failure = e.message;
  } finally {
    await request("shutdown").catch(() => undefined);
    notify("exit");
    // The server we started: stop it by its own handle if it ignores `exit`.
    const grace = setTimeout(() => child.kill(), 5000);
    await new Promise((r) => child.once("exit", r));
    clearTimeout(grace);
  }
  return { ops, entries, hover, diags, failure };
}

const MB = 2 ** 20;
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const allWork = (r) => Object.values(r.ops).flat();
/** The largest RSS / committed heap + external over every measured operation. */
const peakRss = (r) => Math.max(...allWork(r).map((w) => w.rss)) / MB;
const peakCommitted = (r) =>
  Math.max(...allWork(r).map((w) => (w.heapTotal ?? NaN) + (w.external ?? NaN))) / MB;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-types-ide-"));
const results = [];
let baseline;
try {
  // A 100-key project: tsserver's own memory (TypeScript itself), the base of mem:rss.
  {
    const p = project(path.join(tmp, "baseline"), 100, 2);
    baseline = LSP ? await measureLsp(p) : await measure(p);
  }
  for (const nsCount of nsCounts)
    for (const total of sizes) {
      const p = project(path.join(tmp, `p${total}x${nsCount}`), total, nsCount);
      const m = LSP ? await measureLsp(p) : await measure(p);
      results.push({ total, nsCount, keysPerNs: p.keysPerNs, nsUsed: p.nsUsed, p, ...m });
    }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `types IDE bench${red ? ` (RED: ${red})` : ""}: ${LSP ? "tsc --lsp" : "tsserver"} ${tsVersion}, node ${process.version}, ` +
    `${rounds} rounds, load1 ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cpus (${os.platform()} ${os.arch()})`,
);
const OPS = {
  a1: 't("|',
  a2: 'shop.t("|',
  a3: "{ | }",
  a4: "{ | } opt",
  b: "hover",
  c: "diag/edit",
  c2: "diag/typo",
  j: "diag/<T> typo",
  d: "diag/regen",
};
const cell = (list, k) => (LSP || !list.length ? "-" : String(med(list.map((w) => w[k]))));
console.log(
  "keys×ns    | op            | inst (median) | union  | types  | nest   | ms (median) [rounds]",
);
for (const r of results)
  for (const [op, list] of Object.entries(r.ops))
    console.log(
      `${`${r.total / 1000}k×${r.nsCount}`.padEnd(10)} | ${OPS[op].padEnd(13)} | ${cell(list, "inst").padStart(13)} | ${cell(list, "union").padStart(6)} | ${cell(list, "types").padStart(6)} | ${cell(list, "nest").padStart(6)} | ${list.length ? med(list.map((w) => w.ms)).toFixed(1) : "-"} [${list.map((w) => w.ms.toFixed(0)).join(", ")}]`,
    );

const failedIds = new Set();
const gate = (id, ok, line) => {
  if (!ok) failedIds.add(id);
  console.log(`${ok ? "+" : "x"} [${id}] ${line}`);
};
const sameSet = (got, want) => {
  const a = [...got].sort();
  const b = [...want].sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
};
const setDiff = (got, want) => {
  const g = new Set(got);
  const w = new Set(want);
  const missing = want.filter((x) => !g.has(x));
  const extra = got.filter((x) => !w.has(x));
  return `${missing.length} missing${missing.length ? ` (${missing.slice(0, 3).join(", ")})` : ""}, ${extra.length} extra${extra.length ? ` (${extra.slice(0, 3).join(", ")})` : ""}`;
};
for (const r of [baseline, ...results].filter((x) => x.failure)) {
  const label = r === baseline ? "100 keys" : `${r.total / 1000}k×${r.nsCount}`;
  gate(
    /comvi work cap/.test(r.failure) ? "workcap" : "request",
    false,
    `${label}: ${r.failure} (gate: every request answers within the counted work cap)`,
  );
}
for (const r of results.filter((x) => !x.failure)) {
  const label = `${r.total / 1000}k×${r.nsCount}`;
  // (a1)/(a2): exactly the namespace's key set, in every round.
  for (const [site, ns] of [
    ["a1", "default"],
    ["a2", "shop"],
  ]) {
    const bad = r.entries[site]
      .map((names, round) => {
        const want = [
          ...r.p.keys[ns],
          ...(site === "a1" && hasAdded(site, round) ? ["zz.added"] : []),
        ];
        return sameSet(names, want) ? undefined : `round ${round}: ${setDiff(names, want)}`;
      })
      .filter(Boolean);
    gate(
      `complete:${site}`,
      bad.length === 0,
      `${label} ${OPS[site]} completions: ${r.entries[site].map((n) => n.length).join("/")} entries (gate: exactly the ${ns} namespace's ${r.p.keys[ns].length} keys${site === "a1" ? " (+ zz.added while declared)" : ""})${bad.length ? ` — ${bad.join("; ")}` : ""}`,
    );
  }
  // (a3)/(a4): exactly the key's params and the per-call options — not "few", the set.
  for (const [site, want] of [
    ["a3", ["locale", "markers", "name", "ns"]],
    ["a4", ["brand", "locale", "markers", "ns"]],
  ]) {
    const got = r.entries[site].at(-1) ?? [];
    gate(
      `complete:${site}`,
      r.entries[site].every((names) => sameSet(names, want)),
      `${label} ${OPS[site]} completions: ${[...got].sort().join(", ") || "(none)"} (gate: = ${want.join(", ")})`,
    );
  }
  // (b): the hover names the key and its param (a server that resolved nothing says neither).
  gate(
    "hover",
    /s[01]\.k1/.test(r.hover) && /\bname\b/.test(r.hover),
    `${label} hover: ${JSON.stringify(r.hover.replace(/\s+/g, " ").slice(0, 120))} (gate: names the key s0.k1 or s1.k1 and its param name)`,
  );
  // (c)/(c2)/(j)/(d): exactly the expected lines in every round.
  const { unfinished, added } = r.p.sites;
  const editLine = r.p.sites.edit.line;
  const jsxLine = r.p.sites.jsx.line;
  for (const op of ["c", "c2", "j", "d"]) {
    const bad = r.diags[op]
      .map((list, round) => {
        const want = [...unfinished, ...(hasAdded(op, round) ? [] : [added])];
        if (op === "c2") want.push(editLine);
        if (op === "j") want.push(jsxLine);
        const got = [...new Set(list.map((d) => Number(d.split(":")[0])))].sort((x, y) => x - y);
        want.sort((x, y) => x - y);
        const code =
          op === "c2"
            ? list.includes(`${editLine}:TS2345`)
            : op === "j"
              ? list.includes(`${jsxLine}:TS2322`)
              : true;
        const addedCode = hasAdded(op, round) || list.includes(`${added}:TS2345`);
        return got.join() === want.join() && code && addedCode
          ? undefined
          : `round ${round}: lines ${got.join(", ") || "(none)"}, want ${want.join(", ")}`;
      })
      .filter(Boolean);
    gate(
      `diag:${op}`,
      bad.length === 0,
      `${label} ${OPS[op]} diagnostics in ${r.diags[op].length} rounds (gate: the unfinished lines ${unfinished.join(", ")}, line ${added} while zz.added is not declared${op === "c2" ? `, TS2345 on ${editLine}` : op === "j" ? `, TS2322 on ${jsxLine}` : ""})${bad.length ? ` — ${bad.join("; ")}` : ""}`,
    );
  }
}
if (LSP)
  console.log(
    "i counted scaling and memory gates: not available on TypeScript 7 (a native checker, nothing to count); ms and RSS are printed",
  );
for (const nsCount of LSP ? [] : nsCounts) {
  const small = results.find((r) => r.nsCount === nsCount && r.total === Math.min(...sizes));
  const big = results.find((r) => r.nsCount === nsCount && r.total === Math.max(...sizes));
  if (!small || !big || small === big || small.failure || big.failure) continue;
  // A new program (after an edit or a regeneration) builds each namespace's key literals
  // and key union ONCE: `keysPerNs` union inputs and types per namespace the file uses.
  // That is the catalog, not the calls; the gate reads the work beyond it, which must not
  // grow with the catalog.
  const program = (op) => op === "c" || op === "c2" || op === "j" || op === "d";
  const beyondKeys = (r, op, x) => (program(op) ? x - r.keysPerNs * r.nsUsed : x);
  for (const op of OP_NAMES)
    for (const metric of ["inst", "union", "types"]) {
      const pick = (r) => (w) => (metric === "inst" ? w.inst : beyondKeys(r, op, w[metric]));
      const a = med(small.ops[op].map(pick(small)));
      const b = med(big.ops[op].map(pick(big)));
      // Below 50 units of work there is nothing to scale: a constant, not a trend.
      const ratio = Math.max(b, 50) / Math.max(a, 50);
      const what = metric !== "inst" && program(op) ? `${metric} beyond the key literals` : metric;
      gate(
        `scale:${op}:${metric}`,
        ratio <= GATES.scaling,
        `counted scaling ${small.total / 1000}k → ${big.total / 1000}k ×${nsCount} ns, ${OPS[op]} ${what}: ${a} → ${b} = ${ratio.toFixed(2)}× (gate ≤ ${GATES.scaling}×)`,
      );
    }
}
// Memory: the peak over every measured operation, not the last sample.
const base = baseline.failure ? NaN : peakRss(baseline);
console.log(
  LSP
    ? `i memory baseline (100 keys): peak rss ${base.toFixed(0)} MB (native process)`
    : `i memory baseline (100 keys): peak rss ${base.toFixed(0)} MB, peak committed ${peakCommitted(baseline).toFixed(0)} MB`,
);
for (const r of results.filter((x) => !x.failure)) {
  const label = `${r.total / 1000}k×${r.nsCount}`;
  const growth = peakRss(r) - base;
  if (LSP) {
    console.log(
      `i memory ${label}: peak rss ${peakRss(r).toFixed(0)} MB (+${growth.toFixed(0)} over 100 keys; native process)`,
    );
    continue;
  }
  gate(
    "mem:rss",
    growth <= GATES.rssGrowthMB,
    `tsserver memory ${label}: peak RSS ${peakRss(r).toFixed(0)} MB = +${growth.toFixed(0)} MB over the 100-key tsserver (gate ≤ ${GATES.rssGrowthMB} MB growth)`,
  );
  gate(
    "mem:committed",
    peakCommitted(r) <= GATES.committedMB,
    `tsserver memory ${label}: peak committed heap + external ${peakCommitted(r).toFixed(0)} MB (gate ≤ ${GATES.committedMB} MB)`,
  );
}
for (const r of results.filter((x) => x.total === Math.max(...sizes) && x.ops.a1.length))
  console.log(
    `i completions @${r.total / 1000}k×${r.nsCount}: ${med(r.ops.a1.map((w) => w.ms)).toFixed(1)} ms (informational, target < 100 ms)`,
  );

if (red) {
  const want = RED.gates;
  const missed = want.filter((id) => !failedIds.has(id));
  console.log(
    missed.length === 0
      ? `RED run (${red}): failed ${[...failedIds].join(", ")} — every gate it exists for (${want.join(", ")}) sees this regression`
      : `RED run (${red}): ${missed.join(", ")} PASSED on the planted regression — blind (failed: ${[...failedIds].join(", ") || "none"})`,
  );
  process.exitCode = missed.length === 0 ? 0 : 1;
} else process.exitCode = failedIds.size ? 1 : 0;
