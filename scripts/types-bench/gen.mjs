// Generates a tsc probe project for the typed `t()` of @comvi/core (lot-0 spike S2,
// `.omc/artifacts/reference-i18n-2026-10/lot0/S2/gen.mjs`, ported). The probe's lib.ts
// is packages/core/src/types.ts VERBATIM plus two declared factories, so every gate
// measures the signature that ships.
//
//   generateProbe(dir, { keys, kind, body })   kind: app300 | app30 | typo | untyped | body
//   (`body`: lines appended after the probe header — the negative suite passes its cases)
//
// Catalog: 2 namespaces (default, shop) × `keys` keys in 50 sections; key kinds rotate
// through plural / rich (Tag param) / defaultParams-optional / name / select / no params.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const TYPES_SOURCE = path.join(ROOT, "packages/core/src/types.ts");

const SECTIONS = 50;
const kindOf = (j) =>
  j % 10 === 0
    ? "plural"
    : j % 25 === 7
      ? "rich"
      : j % 25 === 12
        ? "dp"
        : j % 50 === 17
          ? "dpOnly"
          : j % 4 === 1
            ? "name"
            : j % 20 === 3
              ? "select"
              : "plain";
const TYPE = {
  plural: "{ count: number }",
  rich: "{ link: Tag }",
  dp: "{ name: string | number; brand?: string }",
  dpOnly: "{ brand?: string }",
  name: "{ name: string | number }",
  select: "{ g: 'male' | 'female' | (string & {}) }",
  plain: "never",
};
const PARAM = {
  plural: "count: 2",
  rich: "link: tag",
  dp: "name: 'x'",
  dpOnly: "",
  name: "name: 'x'",
  select: "g: 'male'",
  plain: "",
};

const LIB_TAIL = `
export declare function createI18n(o: { locale: string }): { t: TFor };
export declare function useI18n<NS extends string = "default">(ns?: NS): { t: TFor<NS> };
`;

export function generateProbe(dir, { keys, kind, body = [], typesSource }) {
  const per = keys / SECTIONS;
  const all = [];
  for (let s = 0; s < SECTIONS; s++) for (let j = 0; j < per; j++) all.push({ s, j, k: kindOf(j) });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "lib.ts"),
    (typesSource ?? fs.readFileSync(TYPES_SOURCE, "utf8")) + LIB_TAIL,
  );
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
  if (kind !== "untyped") {
    for (const ns of ["default", "shop"]) {
      const L = [
        "import type { Tag } from './lib';",
        "declare module './lib' {",
        `  interface Catalogs { ${ns}: {`,
      ];
      for (const { s, j, k } of all) L.push(`    ${JSON.stringify(`s${s}.k${j}`)}: ${TYPE[k]};`);
      L.push("  } }", "}", "export {};");
      fs.writeFileSync(path.join(dir, `keys-${ns}.ts`), L.join("\n"));
    }
  }
  const A = [
    "import { createI18n, type RichParts, type Tag } from './lib';",
    "const i18n = createI18n({ locale: 'en' });",
    "const t = i18n.t;",
    "declare const tag: Tag; declare const cond: boolean;",
    "export const out: string[] = []; export const rich: RichParts[] = [];",
  ];
  if (kind === "app300" || kind === "app30") {
    const calls = kind === "app300" ? 300 : 30;
    const step = Math.floor(all.length / 300);
    all
      .filter((_, i) => i % step === 0)
      .slice(0, calls)
      .forEach(({ s, j, k }, i) => {
        const opts = [];
        if (PARAM[k]) opts.push(PARAM[k]);
        if (i % 3 === 1) opts.unshift("ns: 'shop'");
        if (i % 5 === 2) opts.push("locale: 'de'");
        if (k === "dp" && i % 2) opts.push("brand: 'B'");
        const call = `t('s${s}.k${j}'${opts.length ? `, { ${opts.join(", ")} }` : ""})`;
        A.push(k === "rich" ? `rich.push(${call});` : `out.push(${call});`);
      });
    const unions = kind === "app300" ? 10 : 1;
    for (let i = 0; i < unions; i++)
      A.push(
        `out.push(t(cond ? 's${i}.k0' : 's${i}.k1', { count: 1, name: 'x'${i % 2 ? ", ns: 'shop'" : ""} }));`,
      );
    A.push(
      "rich.push(t('s1.k7', { link: tag }));",
      "out.push(t('s1.k17'));",
      "out.push(t('s1.k17', { brand: 'B', ns: 'shop' }));",
    );
  } else if (kind === "body") {
    A.push(...body);
  } else if (kind === "typo") {
    A.push("out.push(t('s0.zzz'));", "out.push(t('s0.zzz', { count: 1 }));");
  } else if (kind === "untyped") {
    A.push("out.push(t('anything'), t('x', { n: 1, ns: 'whatever' }));");
  }
  fs.writeFileSync(path.join(dir, "app.ts"), A.join("\n") + "\n");
  return { dir, headerLines: 5 };
}

export const TSC = path.join(ROOT, "node_modules/typescript/bin/tsc");
