// @vitest-environment node
/**
 * `ServerTranslatingHost` is the one sanctioned way back to the host's
 * translator, and "one" is the whole point of it.
 *
 * `tests/types/server-host.test-d.ts` pins the type's SHAPE — that it adds
 * exactly `t | tRaw` to `ServerI18nHost`. Nothing pins its REACH. A second
 * server helper that wrote the same `i18n as ServerTranslatingHost` would
 * translate against whatever locale it happened to have, and every gate would
 * stay green, because a widening that two call sites may use is no longer a
 * contract — it is an escape hatch with a comment on it.
 *
 * So the reach is asserted the way the middleware entry's is: structurally.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/server");

/** The files under `src/server/` that name a given identifier, by basename. */
const filesNaming = (identifier: string): string[] =>
  fs
    .readdirSync(serverDir)
    .filter((entry) => entry.endsWith(".ts"))
    .filter((entry) => fs.readFileSync(path.join(serverDir, entry), "utf8").includes(identifier))
    .sort();

describe("the server pipeline's one crossing back to the host translator", () => {
  it("is named in exactly the file that declares it and the file that uses it", () => {
    expect(filesNaming("ServerTranslatingHost")).toEqual(["getI18n.ts", "hostTypes.ts"]);
  });

  it("control: the probe reports every file that names the host type itself", () => {
    // `ServerI18nHost` is the pipeline-wide type, so a scan that found only two
    // files for it would mean the probe above is reading the wrong directory.
    expect(filesNaming("ServerI18nHost")).toEqual([
      "cache.ts",
      "createNextI18nFromHost.ts",
      "ensureInitialized.ts",
      "getI18n.ts",
      "hostTypes.ts",
      "loadMessages.ts",
    ]);
  });
});
