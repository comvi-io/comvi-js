/* eslint-disable @typescript-eslint/no-require-imports -- a `node -r` preload is CommonJS */
// Preloaded into the IDE bench's tsserver (`node -r ide-count.cjs tsserver.js`). It counts
// checker WORK — deterministic for a given program, request sequence and TypeScript
// version, unlike milliseconds — and reports it per protocol request on fd 3:
//
//   inst    instantiations (the checker's own `instantiationCount++`)
//   types   types created (`typeCount++`)
//   union   member types handed to getUnionType (what a per-call `keyof` rebuild costs)
//   nest    calls of hasMatchingRecursionIdentity, the relation-stack walk that a `<T>`
//           without the typo guard spends minutes in (lot 3 review, BLOCK 1)
//   ms      the request's own time inside tsserver (informational only)
//   rss, heap  the process after the request, measured after a full GC (--expose-gc)
//
// Work cap: a request past COMVI_WORK_CAP nest checks (default 50 M) throws "comvi work
// cap" inside the checker; tsserver answers that request with an error, which the bench
// reports as a failed gate — a counted stop instead of waiting for the hang guard.
//
// The counters are injected into typescript/lib/typescript.js at load time, and
// Session.prototype.executeCommand is wrapped once the module is loaded. If any hook is
// not found this throws: a gate that cannot count must not pass.
const fs = require("fs");
const Module = require("module");
const compile = Module.prototype._compile;
const C = (globalThis.__comviIde = { inst: 0, types: 0, union: 0, nest: 0, capAt: Infinity });
const CAP = Number(process.env.COMVI_WORK_CAP) || 50_000_000;

Module.prototype._compile = function (content, filename) {
  const isTs = filename.replace(/\\/g, "/").endsWith("/typescript/lib/typescript.js");
  if (isTs) {
    const inst = "instantiationCount++;";
    const types = "typeCount++;";
    const union =
      "function getUnionType(types, unionReduction = 1 /* Literal */, aliasSymbol, aliasTypeArguments, origin) {";
    const nest = "function hasMatchingRecursionIdentity(type, identity2) {";
    for (const needle of [inst, types, union, nest])
      if (!content.includes(needle))
        throw new Error(
          `ide bench: cannot find "${needle}" in typescript.js (TypeScript changed?)`,
        );
    content = content
      .split(inst)
      .join(inst + "globalThis.__comviIde.inst++;")
      .split(types)
      .join(types + "globalThis.__comviIde.types++;")
      .replace(union, union + "globalThis.__comviIde.union+=types.length;")
      .replace(
        nest,
        nest +
          'if(++globalThis.__comviIde.nest>globalThis.__comviIde.capAt)throw new Error("comvi work cap: "+globalThis.__comviIde.nest);',
      );
  }
  const result = compile.call(this, content, filename);
  if (isTs) {
    const Session = this.exports.server && this.exports.server.Session;
    if (!Session || typeof Session.prototype.executeCommand !== "function")
      throw new Error("ide bench: cannot find ts.server.Session.prototype.executeCommand");
    const run = Session.prototype.executeCommand;
    Session.prototype.executeCommand = function (request) {
      const before = { ...C };
      C.capAt = C.nest + CAP;
      const t0 = process.hrtime.bigint();
      const out = run.call(this, request);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const after = { ...C };
      if (global.gc) global.gc();
      const mem = process.memoryUsage();
      fs.writeSync(
        3,
        JSON.stringify({
          seq: request.seq,
          command: request.command,
          inst: after.inst - before.inst,
          types: after.types - before.types,
          union: after.union - before.union,
          nest: after.nest - before.nest,
          ms,
          rss: mem.rss,
          heap: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        }) + "\n",
      );
      return out;
    };
  }
  return result;
};
