// IDE bench of the typed `t()` (design rev 3 R3-19): a REAL tsserver, driven over its
// stdio protocol, on generated projects of 5k / 20k / 50k keys in 2 and 20 namespaces —
// the editor experience that makes developers switch translation typing off when it lags.
//
//   node scripts/types-bench/ide.mjs [--rounds 3]        gate run (pnpm check:types-ide)
//   node scripts/types-bench/ide.mjs --red <variant>     the same gates over a planted
//                                                        regression (keyof | paths |
//                                                        per-locale); exits
//                                                        0 only if a gate FAILS on it
//   node scripts/types-bench/ide.mjs --ts <dir>          another TypeScript (its package
//                                                        directory), e.g. the latest stable
//   --sizes 5000,50000  --ns 2  narrow the matrix (a quick look; the gates need 5k and 50k)
//
// Each project is lib.ts (packages/core/src/types.ts verbatim + two factories, as in
// gen.mjs), comvi.d.ts written by typegen's real emitter, and app.ts: 30 calls across
// namespaces plus the three completion sites. Per round, after a warm-up check of app.ts:
//
//   (a1) completions at t("|            (a2) at useI18n("shop").t("|
//   (a3) completions inside the params object of t("key", { | })
//   (b)  quickinfo (hover) on t in t("key", …)
//   (c)  semantic diagnostics of app.ts after an edit of one call
//   (d)  semantic diagnostics of app.ts after comvi.d.ts is regenerated with a new key
//   (e)  tsserver memory (RSS after a full GC) at the end
//
// BLOCKING gates COUNT work (ide-count.cjs: instantiations, types created, union inputs
// per request — deterministic for a pinned TypeScript, the same on a laptop and a CI
// runner) and never read a clock:
//   - (a1)/(a2) return exactly the namespace's keys (the list itself is the cost the
//     counters cannot see); (a3) returns the params and per-call options, no keys;
//   - counted scaling 5k → 50k ≤ 1.5× for (a), (b), (c): instantiations and union inputs
//     per request (a call's cost does not grow with the catalog). Types created are
//     printed: a new program after an edit creates the namespace's key literals once;
//   - tsserver memory @50k ≤ 400 MB.
// INFORMATIONAL: milliseconds per request inside tsserver, median of the rounds (target:
// completions @50k < 100 ms), with node and TypeScript versions. Never failing.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emitProbe, keyList, probeSchema, ROOT, TYPES_SOURCE } from "./gen.mjs";

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
// completion lists and the process RSS, and gates only the lists.
const LSP = !fs.existsSync(TSSERVER);
const tsVersion = JSON.parse(fs.readFileSync(path.join(tsDir, "package.json"), "utf8")).version;
if (
  !fs.existsSync(path.join(tsDir, "lib/tsserver.js")) &&
  !fs.existsSync(path.join(tsDir, "bin/tsc"))
)
  throw new Error(`--ts ${tsDir}: neither lib/tsserver.js nor bin/tsc`);

const GATES = { scaling: 1.5, memMB: 400 };

// Red variants: each plants a known IDE regression into types.ts; the run exits 0 only if
// a gate FAILS on it (a gate never seen red is unverified).
const REDS = {
  // The key union rebuilt per call: `keyof Catalogs[N]` instead of the cached KeysOf[N].
  keyof: {
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
    types: [
      [
        "export type KeysOf = { [N in NsOf]: keyof Catalogs[N] };",
        "type Split<S extends string> = S extends `${infer H}.${infer R}` ? [H, ...Split<R>] : [S];\n" +
          "type Join<T> = T extends [infer H extends string, ...infer R] ? (R extends [] ? H : `${H}.${Join<R>}`) : never;\n" +
          "export type KeysOf = { [N in NsOf]: { [K in keyof Catalogs[N] & string]: Join<Split<K>> }[keyof Catalogs[N] & string] };",
      ],
    ],
  },
  // A declaration repeated per locale (8 of them), which R3-19 rules out: the memory gate.
  "per-locale": {
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
};
const redArg = args.indexOf("--red");
const red = redArg < 0 ? undefined : args[redArg + 1];
if (red !== undefined && !REDS[red])
  throw new Error(`--red: unknown variant "${red}" (${Object.keys(REDS).join(", ")})`);
let typesSource = fs.readFileSync(TYPES_SOURCE, "utf8");
for (const [from, to] of (red && REDS[red].types) || []) {
  if (!typesSource.includes(from)) throw new Error(`--red ${red}: could not plant ${from}`);
  typesSource = typesSource.replace(from, to);
}
const emit = (schema) => {
  const text = emitProbe(schema);
  if (!(red && REDS[red].dts)) return text;
  const planted = REDS[red].dts(text);
  if (planted === text) throw new Error(`--red ${red}: could not plant the declaration change`);
  return planted;
};

const LIB_TAIL = `
export declare function createI18n(o: { locale: string }): { t: TFor };
export declare function useI18n<NS extends string = "default">(ns?: NS): { t: TFor<NS> };
`;
const NS_NAMES = (n) => [
  "default",
  "shop",
  ...Array.from({ length: n - 2 }, (_, i) => `ns${i + 2}`),
];
const PARAM = {
  plural: "count: 2",
  rich: "link: tag",
  dp: "name: 'x'",
  dpOnly: "",
  name: "name: 'x'",
  select: "g: 'male'",
  plain: "",
};

/** Writes a project; returns its files and the positions of every probe site. */
function project(dir, total, nsCount) {
  const nss = NS_NAMES(nsCount);
  const list = keyList(total / nsCount);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lib.ts"), typesSource + LIB_TAIL);
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
      },
      include: ["*.ts"],
    }),
  );
  const schema = probeSchema(nss, list);
  const dts = emit(schema);
  fs.writeFileSync(path.join(dir, "comvi.d.ts"), dts);
  const L = [
    "import { createI18n, useI18n, type Tag } from './lib';",
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
    L.push(`out.push(t('s${s}.k${j}'${params ? `, { ${params} }` : ""}));`);
  }
  // The edit (c) and hover (b) target: a `name` key.
  const editLine = L.length;
  L.push("out.push(t('s0.k1', { name: 'x' }));");
  const a1 = L.length;
  L.push("out.push(t(''));");
  const a2 = L.length;
  L.push("out.push(shop.t(''));");
  const a3 = L.length;
  L.push("out.push(t('s0.k1', {  }));");
  const app = L.join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "app.ts"), app);
  // Protocol positions are 1-based line and offset.
  return {
    app: path.join(dir, "app.ts"),
    dts: path.join(dir, "comvi.d.ts"),
    appText: app,
    dtsText: dts,
    keysPerNs: list.length,
    nsUsed: used.size,
    sites: {
      a1: { line: a1 + 1, offset: "out.push(t('".length + 1 },
      a2: { line: a2 + 1, offset: "out.push(shop.t('".length + 1 },
      a3: { line: a3 + 1, offset: "out.push(t('s0.k1', { ".length + 1 },
      b: { line: editLine + 1, offset: "out.push(".length + 1 },
      edit: { line: editLine + 1, offset: "out.push(t('s0.k".length + 1 },
    },
    // A regenerated comvi.d.ts: one key more in the default namespace.
    dtsNext: emit({
      ...schema,
      namespaces: {
        ...schema.namespaces,
        default: { ...schema.namespaces.default, "zz.added": {} },
      },
    }),
  };
}

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
    });
  return { child, request };
}

async function measure(p) {
  const { child, request } = startServer();
  try {
    await request("open", { file: p.app, fileContent: p.appText, scriptKindName: "TS" });
    await request("open", { file: p.dts, fileContent: p.dtsText, scriptKindName: "TS" });
    await request("semanticDiagnosticsSync", { file: p.app }); // warm-up
    const ops = { a1: [], a2: [], a3: [], b: [], c: [], d: [] };
    const out = { entries: {} };
    for (let r = 0; r < rounds; r++) {
      for (const site of ["a1", "a2", "a3"]) {
        const { msg, work } = await request("completionInfo", { file: p.app, ...p.sites[site] });
        ops[site].push(work);
        out.entries[site] = msg.body?.entries ?? [];
      }
      ops.b.push((await request("quickinfo", { file: p.app, ...p.sites.b })).work);
      // (c) edit one call ('s0.k1' ↔ 's0.k5', both `name` keys), then check the file.
      const digit = r % 2 ? "1" : "5";
      await request("change", {
        file: p.app,
        line: p.sites.edit.line,
        offset: p.sites.edit.offset,
        endLine: p.sites.edit.line,
        endOffset: p.sites.edit.offset + 1,
        insertString: digit,
      });
      ops.c.push((await request("semanticDiagnosticsSync", { file: p.app })).work);
      // (d) comvi.d.ts regenerated (a new key, then back), then the whole file again.
      await request("updateOpen", {
        changedFiles: [],
        openFiles: [
          { file: p.dts, fileContent: r % 2 ? p.dtsText : p.dtsNext, scriptKindName: "TS" },
        ],
      });
      ops.d.push((await request("semanticDiagnosticsSync", { file: p.app })).work);
    }
    const last = ops.d.at(-1);
    return {
      ops,
      entries: out.entries,
      rssMB: last.rss / 2 ** 20,
      heapMB: last.heap / 2 ** 20,
      totalMB: last.heapTotal / 2 ** 20,
      extMB: last.external / 2 ** 20,
    };
  } finally {
    child.stdin.end(JSON.stringify({ seq: 1e9, type: "request", command: "exit" }) + "\n");
    await new Promise((r) => child.once("exit", r));
  }
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
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const t0 = process.hrtime.bigint();
      waiting.set(n, (msg) =>
        msg.error
          ? reject(new Error(`${method}: ${msg.error.message}`))
          : resolve({
              result: msg.result,
              work: { ms: Number(process.hrtime.bigint() - t0) / 1e6 },
            }),
      );
      send({ jsonrpc: "2.0", id: n, method, params });
    });
  const notify = (method, params) => send({ jsonrpc: "2.0", method, params });
  const uri = (file) => pathToFileURL(file).href;
  const pos = ({ line, offset }) => ({ line: line - 1, character: offset - 1 });
  const versions = { app: 1, dts: 1 };
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
    for (const [file, text] of [
      [p.app, p.appText],
      [p.dts, p.dtsText],
    ])
      notify("textDocument/didOpen", {
        textDocument: { uri: uri(file), languageId: "typescript", version: 1, text },
      });
    const diagnose = () =>
      request("textDocument/diagnostic", { textDocument: { uri: uri(p.app) } });
    await diagnose(); // warm-up
    const ops = { a1: [], a2: [], a3: [], b: [], c: [], d: [] };
    const entries = {};
    for (let r = 0; r < rounds; r++) {
      for (const site of ["a1", "a2", "a3"]) {
        const { result, work } = await request("textDocument/completion", {
          textDocument: { uri: uri(p.app) },
          position: pos(p.sites[site]),
        });
        ops[site].push(work);
        entries[site] = (Array.isArray(result) ? result : (result?.items ?? [])).map((i) => ({
          name: i.label,
        }));
      }
      ops.b.push(
        (
          await request("textDocument/hover", {
            textDocument: { uri: uri(p.app) },
            position: pos(p.sites.b),
          })
        ).work,
      );
      const digit = r % 2 ? "1" : "5";
      const at = pos(p.sites.edit);
      notify("textDocument/didChange", {
        textDocument: { uri: uri(p.app), version: ++versions.app },
        contentChanges: [
          { range: { start: at, end: { ...at, character: at.character + 1 } }, text: digit },
        ],
      });
      ops.c.push((await diagnose()).work);
      notify("textDocument/didChange", {
        textDocument: { uri: uri(p.dts), version: ++versions.dts },
        contentChanges: [{ text: r % 2 ? p.dtsText : p.dtsNext }],
      });
      ops.d.push((await diagnose()).work);
    }
    const rss =
      Number(execFileSync("ps", ["-o", "rss=", "-p", String(child.pid)]).toString()) / 1024;
    return { ops, entries, rssMB: rss, heapMB: NaN, totalMB: NaN, extMB: NaN };
  } finally {
    await request("shutdown").catch(() => undefined);
    notify("exit");
    // The server we started: stop it by its own handle if it ignores `exit`.
    const grace = setTimeout(() => child.kill(), 5000);
    await new Promise((r) => child.once("exit", r));
    clearTimeout(grace);
  }
}

const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-types-ide-"));
const results = [];
try {
  for (const nsCount of nsCounts)
    for (const total of sizes) {
      const p = project(path.join(tmp, `p${total}x${nsCount}`), total, nsCount);
      const m = LSP ? await measureLsp(p) : await measure(p);
      results.push({ total, nsCount, keysPerNs: p.keysPerNs, nsUsed: p.nsUsed, ...m });
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
  b: "hover",
  c: "diag/edit",
  d: "diag/regen",
};
console.log("keys×ns    | op         | inst (median) | union | types  | ms (median) [rounds]");
for (const r of results)
  for (const [op, list] of Object.entries(r.ops))
    console.log(
      `${`${r.total / 1000}k×${r.nsCount}`.padEnd(10)} | ${OPS[op].padEnd(10)} | ${String(LSP ? "-" : med(list.map((w) => w.inst))).padStart(13)} | ${String(LSP ? "-" : med(list.map((w) => w.union))).padStart(5)} | ${String(LSP ? "-" : med(list.map((w) => w.types))).padStart(6)} | ${med(list.map((w) => w.ms)).toFixed(1)} [${list.map((w) => w.ms.toFixed(0)).join(", ")}]`,
    );

let failed = 0;
const fail = (line) => {
  failed++;
  console.log(`x ${line}`);
};
const pass = (line) => console.log(`+ ${line}`);
for (const r of results) {
  const label = `${r.total / 1000}k×${r.nsCount}`;
  // (a1)/(a2): exactly the namespace's keys; (a3): params and options, no keys.
  for (const site of ["a1", "a2"]) {
    const names = r.entries[site].map((e) => e.name);
    const keys = names.filter((n) => /^s\d+\.k\d+$/.test(n)).length;
    const line = `${label} ${OPS[site]} completions: ${names.length} entries, ${keys} keys (gate: = ${r.keysPerNs} keys of the namespace, nothing else)`;
    if (names.length === r.keysPerNs && keys === r.keysPerNs) pass(line);
    else fail(line);
  }
  const a3 = r.entries.a3.map((e) => e.name);
  const a3line = `${label} ${OPS.a3} completions: ${a3.join(", ")} (gate: the key's params and ns/locale/markers only)`;
  if (a3.length <= 8 && !a3.some((n) => /^s\d+\.k\d+$/.test(n))) pass(a3line);
  else fail(a3line);
}
if (LSP)
  console.log(
    "i counted scaling and memory gates: not available on TypeScript 7 (a native checker, nothing to count); ms and RSS are printed",
  );
for (const nsCount of LSP ? [] : nsCounts) {
  const small = results.find((r) => r.nsCount === nsCount && r.total === Math.min(...sizes));
  const big = results.find((r) => r.nsCount === nsCount && r.total === Math.max(...sizes));
  if (!small || !big || small === big) continue;
  // A new program (after an edit or a regeneration) builds each namespace's key union
  // ONCE: `keysPerNs` union inputs per namespace the file uses. That is the catalog, not
  // the calls; the gate reads the work beyond it, which must not grow with the catalog.
  const beyondKeys = (r, op, w) =>
    op === "c" || op === "d" ? w.union - r.keysPerNs * r.nsUsed : w.union;
  for (const op of ["a1", "a2", "a3", "b", "c", "d"])
    for (const metric of ["inst", "union"]) {
      const pick = (r) => (w) => (metric === "union" ? beyondKeys(r, op, w) : w[metric]);
      const a = med(small.ops[op].map(pick(small)));
      const b = med(big.ops[op].map(pick(big)));
      // Below 50 units of work there is nothing to scale: a constant, not a trend.
      const ratio = Math.max(b, 50) / Math.max(a, 50);
      const what =
        metric === "union" && (op === "c" || op === "d") ? "union beyond the key unions" : metric;
      const line = `counted scaling ${small.total / 1000}k → ${big.total / 1000}k ×${nsCount} ns, ${OPS[op]} ${what}: ${a} → ${b} = ${ratio.toFixed(2)}× (gate ≤ ${GATES.scaling}×)`;
      if (ratio <= GATES.scaling) pass(line);
      else fail(line);
    }
}
for (const r of results)
  console.log(
    LSP
      ? `i memory ${r.total / 1000}k×${r.nsCount}: rss ${r.rssMB.toFixed(0)} MB (native process)`
      : `i memory ${r.total / 1000}k×${r.nsCount}: rss ${r.rssMB.toFixed(0)} MB, heap used ${r.heapMB.toFixed(0)} MB, heap committed ${r.totalMB.toFixed(0)} MB, external ${r.extMB.toFixed(0)} MB`,
  );
for (const r of results.filter((x) => x.total === 50_000 && !LSP)) {
  // tsserver's live heap after a full GC, as tsc's "Memory used" in bench.mjs. RSS is
  // printed above: on macOS it keeps freed pages (MADV_FREE) and tsserver's own baseline
  // is ~230 MB of it, so it says more about the allocator than about the types.
  const line = `tsserver memory @50k×${r.nsCount}: ${r.heapMB.toFixed(0)} MB live heap (gate ≤ ${GATES.memMB} MB)`;
  if (r.heapMB <= GATES.memMB) pass(line);
  else fail(line);
}
for (const r of results.filter((x) => x.total === Math.max(...sizes)))
  console.log(
    `i completions @${r.total / 1000}k×${r.nsCount}: ${med(r.ops.a1.map((w) => w.ms)).toFixed(1)} ms (informational, target < 100 ms)`,
  );

if (red) {
  console.log(
    failed
      ? `RED run (${red}): ${failed} gate(s) failed — the gates see this regression`
      : `RED run (${red}): every gate PASSED on the planted regression — they are blind`,
  );
  process.exitCode = failed ? 0 : 1;
} else process.exitCode = failed ? 1 : 0;
