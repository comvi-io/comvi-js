/* eslint-disable @typescript-eslint/no-require-imports -- a `node -r` preload is CommonJS */
// Preloaded into the probe's tsc (`node -r count-work.cjs tsc …`): counts three kinds of
// checker WORK, deterministic for a given program and tsc version — unlike seconds:
//
//   KeyofWork    properties read by getLiteralTypeFromProperties, i.e. the members every
//                `keyof X` resolution walks;
//   UnionInputs  member types handed to getUnionType;
//   NestChecks   calls of hasMatchingRecursionIdentity: the relation stack walk of
//                isDeeplyNestedType, quadratic in the depth of a relation over a large
//                intersection.
//
// R3-1's `keyof Catalogs[N]` in the signature rebuilds the key union on EVERY call, so
// KeyofWork and UnionInputs grow by keys × calls (6.4 M union inputs at 20k keys × 300
// calls), while the cached mapped `KeysOf[N]` keeps them flat (≈7.6 K per 298 calls at 5k
// and at 20k). A component signature without the typo guard (lot 3 review, BLOCK 1) types
// the JSX attributes against the intersection of every key's params: instantiations, types
// and union inputs stay near-linear, the time goes into NestChecks (minutes at 5k keys).
//
// Work cap: past COMVI_WORK_CAP NestChecks (default 50 M) the process prints its counters,
// `WorkCap: exceeded` and exits — a counted stop, so a red run over that regression ends in
// seconds instead of hours. A green probe does a few thousand.
//
// The counters are injected into typescript/lib/_tsc.js at load time (vue-tsc: into the
// compiler it compiles under the `tsc.js` name). If any function is
// not found, this throws: a gate that cannot count must not pass.
const Module = require("module");
const compile = Module.prototype._compile;
const CAP = Number(process.env.COMVI_WORK_CAP) || 50_000_000;
// vue-tsc (Volar's runTsc) compiles the whole compiler under the name of the `tsc.js` shim.
const COMPILER = /\/typescript\/lib\/_?tsc\.js$/;
Module.prototype._compile = function (content, filename) {
  if (COMPILER.test(filename.replace(/\\/g, "/")) && content.length > 1e6) {
    const keyof = "function getLiteralTypeFromProperties(type, include, includeOrigin) {";
    const union =
      "function getUnionType(types, unionReduction = 1 /* Literal */, aliasSymbol, aliasTypeArguments, origin) {";
    const nest = "function hasMatchingRecursionIdentity(type, identity2) {";
    for (const needle of [keyof, union, nest])
      if (!content.includes(needle))
        throw new Error("types-bench: cannot find the checker functions to count (tsc changed?)");
    content = content
      .replace(
        keyof,
        keyof + "globalThis.__comviKw=(globalThis.__comviKw||0)+getPropertiesOfType(type).length;",
      )
      .replace(union, union + "globalThis.__comviUi=(globalThis.__comviUi||0)+types.length;")
      .replace(
        nest,
        nest +
          `if((globalThis.__comviNc=(globalThis.__comviNc||0)+1)>${CAP}){globalThis.__comviCap=1;process.exit(0);}`,
      );
    process.on("exit", () =>
      process.stdout.write(
        `KeyofWork: ${globalThis.__comviKw || 0}\nUnionInputs: ${globalThis.__comviUi || 0}\n` +
          `NestChecks: ${globalThis.__comviNc || 0}\n` +
          (globalThis.__comviCap ? "WorkCap: exceeded\n" : ""),
      ),
    );
  }
  return compile.call(this, content, filename);
};
