// Generates a tsc probe project for the typed `t()` of @comvi/core (lot-0 spike S2,
// `.omc/artifacts/reference-i18n-2026-10/lot0/S2/gen.mjs`, ported). The probe's lib.ts
// is packages/core/src/types.ts VERBATIM plus two declared factories, and its catalogs are
// written by typegen's REAL emitter (`packages/typegen/src/v2/emit.ts`, loaded with Node's
// type stripping) from a wire schema v2 — so every gate measures the signature AND the
// declaration that ship (R3-18: the §1.3 suite runs on the generated file).
//
//   generateProbe(dir, { keys, kind, body })   kind: app300 | app30 | app2 | typo | untyped | body
//                                              | jsx | jsxTypo (app2 + elements.tsx)
//                                              | vue | vueTypo | vueBase (app2 + Probe.vue, vue-tsc)
//   (`body`: lines appended after the probe header — the negative suite passes its cases
//   (after one fixed line for `untyped`);
//   a body probe also declares the small namespaces `one`, `r1` and `pair`)
//
// Catalog: 2 namespaces (default, shop) × `keys` keys in 50 sections; key kinds rotate
// through plural / rich (tag) / defaultParams-optional / name / select / no params.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const TYPES_SOURCE = path.join(ROOT, "packages/core/src/types.ts");
export const EMITTER = path.join(ROOT, "packages/typegen/src/v2/emit.ts");
const { emitCatalogs } = await import(url.pathToFileURL(EMITTER).href);

const SECTIONS = 50;
export const kindOf = (j) =>
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
/** Wire schema v2 entry per kind (`brand` is a defaultParams name: optional when emitted). */
const WIRE = {
  plural: { params: { count: { kind: "plural" } } },
  rich: { tags: ["link"] },
  dp: { params: { name: { kind: "string" }, brand: { kind: "string" } } },
  dpOnly: { params: { brand: { kind: "string" } } },
  name: { params: { name: { kind: "string" } } },
  select: { params: { g: { kind: "select", options: ["male", "female"], other: true } } },
  plain: {},
};
export const DEFAULT_PARAMS = ["brand"];
export const PARAM = {
  plural: "count: 2",
  rich: "link: tag",
  dp: "name: 'x'",
  dpOnly: "",
  name: "name: 'x'",
  select: "g: 'male'",
  plain: "",
};

/** `{ s, j, k }` per key: `keys` keys in 50 sections. */
export const keyList = (keys) => {
  const per = keys / SECTIONS;
  const all = [];
  for (let s = 0; s < SECTIONS; s++) for (let j = 0; j < per; j++) all.push({ s, j, k: kindOf(j) });
  return all;
};

/** The wire schema v2 of namespaces `nss`, each with the keys of `list`. */
export function probeSchema(nss, list, extra = {}) {
  const namespaces = {};
  for (const ns of nss) {
    const keys = {};
    for (const { s, j, k } of list) keys[`s${s}.k${j}`] = WIRE[k];
    namespaces[ns] = keys;
  }
  return { v: 2, sourceLocale: "en", namespaces: { ...namespaces, ...extra } };
}

/** The declaration typegen writes for `schema`, augmenting `augment`. */
export const emitProbe = (schema, augment = "./lib") =>
  emitCatalogs(schema, { augment, defaultParams: DEFAULT_PARAMS });

const LIB_TAIL = `
export declare function createI18n(o: { locale: string }): { t: TFor };
export declare function useI18n<NS extends string = "default">(ns?: NS): { t: TFor<NS> };
`;

/**
 * The React binding's `<T>` and `useI18n(ns).T` over the real @types/react JSX namespace
 * (its LibraryManagedAttributes and IntrinsicAttributes are part of the cost: a neutral JSX
 * namespace hides the valid-key half of lot 3 review BLOCK 1). `@comvi/react` declares
 * exactly these: `TComponent = TComponentFor<ReactNode, 2, C>`, `BoundT<NS> = BoundTFor<NS,
 * ReactNode, 2, C>` with C its `components` prop (lot 4b; `2`: a tag param is optional only
 * when `components` is passed) — a separate file, so the other probes' programs do not load
 * React.
 */
const REACT_TYPES = path.dirname(
  createRequire(path.join(ROOT, "packages/react/package.json")).resolve(
    "@types/react/package.json",
  ),
);
export const JSX_LIB = `import type { ComponentType, ReactNode } from "react";
import type { BoundTFor, NsOf, TComponentFor } from "./lib";
type C = Readonly<Record<string, string | ComponentType<{ children?: ReactNode }> | { component: string | ComponentType<any>; props?: Readonly<Record<string, unknown>> }>>;
export declare const T: TComponentFor<ReactNode, 2, C>;
export declare function useT<NS extends string>(ns: NS): NS extends NsOf ? BoundTFor<NS, ReactNode, 2, C> : never;
export declare const Em: ComponentType<{ children?: ReactNode }>;
`;
/** compilerOptions that resolve "react" and the automatic JSX runtime to @types/react. */
export const JSX_OPTIONS = {
  jsx: "react-jsx",
  paths: {
    react: [path.join(REACT_TYPES, "index.d.ts")],
    "react/jsx-runtime": [path.join(REACT_TYPES, "jsx-runtime.d.ts")],
  },
};

/**
 * The Vue binding's types over the real `vue` declarations (lot 4): `@comvi/vue` declares
 * exactly these — `T: TComponentFor<VNodeChild, 1, C>`, `useI18n(ns).T: BoundTFor<NS,
 * VNodeChild, 1, C>` (C: the `components` prop, lot 4b), `t: TFor<NS, VNodeArrayChildren>`
 * and `$t` on `ComponentCustomProperties` — asserted
 * IDENTICAL to these by packages/vue/tests/types/typed.test-d.ts (`pnpm --filter @comvi/vue
 * test:types`), so a binding type that drifts from the measured ones fails there. A `.vue`
 * probe is checked by vue-tsc, which types its template: `{{ t(…) }}`, `{{ $t(…) }}` and
 * `<T i18n-key …>` elements, slots included.
 */
const VUE_DIR = path.dirname(
  createRequire(path.join(ROOT, "packages/vue/package.json")).resolve("vue/package.json"),
);
export const VUE_TSC = path.join(
  path.dirname(
    createRequire(path.join(ROOT, "packages/vue/package.json")).resolve("vue-tsc/package.json"),
  ),
  "bin/vue-tsc.js",
);
export const VUE_LIB = `import type { VNodeArrayChildren, VNodeChild } from "vue";
import type { BoundTFor, NsOf, TComponentFor, TFor } from "./lib";
type C = Readonly<Record<string, string | object>>;
export declare const T: TComponentFor<VNodeChild, 1, C>;
export declare function useT<NS extends string>(ns: NS): NS extends NsOf ? BoundTFor<NS, VNodeChild, 1, C> : never;
export declare function useTr<NS extends string>(ns: NS): TFor<NS, VNodeArrayChildren>;
declare module "vue" {
  interface ComponentCustomProperties {
    $t: TFor<"default", VNodeArrayChildren>;
  }
}
`;
const VUE_PROBES = {
  // Valid calls of every kind: t(), the bound t(), $t() and <T>/the bound <T> elements.
  vue: [
    "<p>{{ t('s0.k1', { name: 'x' }) }}{{ t('s0.k0', { ns: 'shop', count: 1 }) }}</p>",
    "<p>{{ st('s1.k0', { count: 2 }) }}{{ $t('s0.k3', { g: 'male', locale: 'de' }) }}</p>",
    "<T i18n-key='s0.k1' name='x' />",
    "<T i18n-key='s0.k0' ns='shop' :count='1' />",
    "<T i18n-key='s1.k7'><template #link='{ children }'><a>{{ children }}</a></template></T>",
    "<T i18n-key='s0.k2' :markers='false' />",
    "<S i18n-key='s0.k1' name='x' />",
    "<S i18n-key='s1.k0' :count='2' />",
    // `components` (lot 4b): an HTML tag name, a component, on both <T>s.
    "<T i18n-key='s1.k7' :components=\"{ link: 'a' }\" />",
    "<S i18n-key='s1.k7' :components='{ link: {} }' />",
  ],
  // Five key typos and one param typo (a misspelled required param: the newcomer's case,
  // DX review) — the only six errors of the program.
  vueTypo: [
    "<p>{{ t('s0.zzz') }}{{ $t('s0.zzz', { count: 1 }) }}</p>",
    "<T i18n-key='s0.zzz' />",
    "<T i18n-key='s0.zzz' :count='1' />",
    "<S i18n-key='s0.zzz' name='x' />",
    "<T i18n-key='s0.k1' nmae='x' />",
  ],
  // The same program with no Comvi call in the template: the baseline of the Vue gates.
  vueBase: ["<p>x</p>"],
};
const vueProbe = (lines) =>
  [
    '<script setup lang="ts">',
    'import { T, useT, useTr } from "./vuelib";',
    'const t = useTr("default");',
    'const st = useTr("shop");',
    'const S = useT("shop");',
    "</script>",
    "<template>",
    ...lines.map((l) => `  ${l}`),
    "</template>",
    "",
  ].join("\n");

export function generateProbe(dir, { keys, kind, body = [], typesSource }) {
  const all = keyList(keys);
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
        ...(kind === "jsx" || kind === "jsxTypo" ? JSX_OPTIONS : {}),
        ...(kind in VUE_PROBES ? { paths: { vue: [VUE_DIR] } } : {}),
      },
      include: ["*.ts", "*.tsx", "*.vue"],
    }),
  );
  if (kind !== "untyped") {
    // Small namespaces for the typo guard's edge (body probes): one key (`one`, rich
    // `r1`) and two keys whose union key spans the whole namespace (`pair`) must keep
    // their exact params.
    const small =
      kind === "body"
        ? {
            one: { only: { params: { name: { kind: "string" } } } },
            r1: { terms: { tags: ["link"] } },
            pair: {
              a: { params: { count: { kind: "plural" } } },
              b: { params: { name: { kind: "string" } } },
            },
          }
        : {};
    fs.writeFileSync(
      path.join(dir, "comvi.d.ts"),
      emitProbe(probeSchema(["default", "shop"], all, small)),
    );
  }
  const A = [
    "import { createI18n, type RichParts, type Tag } from './lib';",
    "const i18n = createI18n({ locale: 'en' });",
    "const t = i18n.t;",
    "declare const tag: Tag; declare const cond: boolean;",
    "export const out: string[] = []; export const rich: (string | RichParts)[] = [];",
  ];
  const app2 = kind === "app2" || kind === "jsx" || kind === "jsxTypo" || kind in VUE_PROBES;
  if (kind === "app300" || kind === "app30" || app2) {
    const calls = kind === "app300" ? 300 : kind === "app30" ? 30 : 2;
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
    // app2 is the baseline of the per-call instantiation gate: the same program with two
    // calls, so (app300 − app2) counts what 298 more calls cost.
    if (!app2) {
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
    }
  } else if (kind === "body") {
    A.push(...body);
  } else if (kind === "typo") {
    A.push("out.push(t('s0.zzz'));", "out.push(t('s0.zzz', { count: 1 }));");
  } else if (kind === "untyped") {
    A.push("out.push(t('anything'), t('x', { n: 1, ns: 'whatever' }));", ...body);
  }
  fs.writeFileSync(path.join(dir, "app.ts"), A.join("\n") + "\n");
  // JSX probes: the app2 program plus one .tsx file of `<T>` elements (lot 3 review,
  // BLOCK 1). `jsx`: valid elements of every key kind; `jsxTypo`: three key typos, the
  // only three errors of the program.
  if (kind === "jsx" || kind === "jsxTypo") {
    fs.writeFileSync(path.join(dir, "jsxlib.ts"), JSX_LIB);
    fs.writeFileSync(
      path.join(dir, "elements.tsx"),
      [
        "import type { Tag } from './lib';",
        "import { Em, T, useT } from './jsxlib';",
        "declare const tag: Tag;",
        "const S = useT('shop');",
        ...(kind === "jsx"
          ? [
              "export const a = [",
              "  <T i18nKey='s0.k1' name='x' />,",
              "  <T i18nKey='s0.k0' ns='shop' count={1} />,",
              "  <T i18nKey='s1.k7' link={tag} />,",
              "  <T i18nKey='s0.k3' g='male' locale='de' />,",
              "  <T i18nKey='s0.k2' markers={false} />,",
              "  <S i18nKey='s0.k1' name='x' />,",
              "  <S i18nKey='s1.k0' count={2} />,",
              // `components` (lot 4b): a tag name, a component, on both <T>s.
              "  <T i18nKey='s1.k7' components={{ link: 'a' }} />,",
              "  <S i18nKey='s1.k7' components={{ link: Em }} />,",
              "  <T i18nKey='s1.k7' components={{ link: { component: 'a', props: { href: '/x' } } }} />,",
              "];",
            ]
          : [
              "export const a = [",
              "  <T i18nKey='s0.zzz' />,",
              "  <T i18nKey='s0.zzz' count={1} />,",
              "  <S i18nKey='s0.zzz' name='x' />,",
              // A misspelled required param, and a rich key with no handler and no
              // `components` (lot 4b) — one error each.
              "  <T i18nKey='s0.k1' nmae='x' />,",
              "  <T i18nKey='s1.k7' />,",
              "];",
            ]),
      ].join("\n") + "\n",
    );
  }
  if (kind in VUE_PROBES) {
    fs.writeFileSync(path.join(dir, "vuelib.ts"), VUE_LIB);
    fs.writeFileSync(path.join(dir, "Probe.vue"), vueProbe(VUE_PROBES[kind]));
  }
  return { dir, headerLines: 5 };
}

export const TSC = path.join(ROOT, "node_modules/typescript/bin/tsc");
