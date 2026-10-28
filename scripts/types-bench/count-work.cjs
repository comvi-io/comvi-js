/* eslint-disable @typescript-eslint/no-require-imports -- a `node -r` preload is CommonJS */
// Preloaded into the probe's tsc (`node -r count-work.cjs tsc …`): counts two kinds of
// checker WORK, deterministic for a given program and tsc version — unlike seconds:
//
//   KeyofWork    properties read by getLiteralTypeFromProperties, i.e. the members every
//                `keyof X` resolution walks;
//   UnionInputs  member types handed to getUnionType.
//
// R3-1's `keyof Catalogs[N]` in the signature rebuilds the key union on EVERY call, so
// both grow by keys × calls (6.4 M union inputs at 20k keys × 300 calls), while the
// cached mapped `KeysOf[N]` keeps them flat (≈7.6 K per 298 calls at 5k and at 20k).
// Instantiation and type counts do not see it (the union is interned, not re-created).
//
// The counters are injected into typescript/lib/_tsc.js at load time. If either function
// is not found, this throws: a gate that cannot count must not pass.
const Module = require("module");
const compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.replace(/\\/g, "/").endsWith("/typescript/lib/_tsc.js")) {
    const keyof = "function getLiteralTypeFromProperties(type, include, includeOrigin) {";
    const union =
      "function getUnionType(types, unionReduction = 1 /* Literal */, aliasSymbol, aliasTypeArguments, origin) {";
    if (!content.includes(keyof) || !content.includes(union))
      throw new Error("types-bench: cannot find the checker functions to count (tsc changed?)");
    content = content
      .replace(
        keyof,
        keyof + "globalThis.__comviKw=(globalThis.__comviKw||0)+getPropertiesOfType(type).length;",
      )
      .replace(union, union + "globalThis.__comviUi=(globalThis.__comviUi||0)+types.length;");
    process.on("exit", () =>
      process.stdout.write(
        `KeyofWork: ${globalThis.__comviKw || 0}\nUnionInputs: ${globalThis.__comviUi || 0}\n`,
      ),
    );
  }
  return compile.call(this, content, filename);
};
