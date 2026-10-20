import esbuild from "esbuild";
import os from "node:os";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const CONDITIONS = ["production", "import", "module", "browser"];
const REACT = ["react", "react/*", "react-dom", "react-dom/*"];
const NEXT = ["next", "next/*", ...REACT];
const VUE = ["vue"];
const NUXT_EXT = ["#app", "#build/*", "#imports", "vue", "vue-router", "h3"];
const NUXT_DEFINE = {
  "import.meta.server": "false",
  "import.meta.client": "true",
  "import.meta.dev": "false",
};
const VUE_I18N_LEAN = {
  __VUE_I18N_FULL_INSTALL__: "false",
  __VUE_I18N_LEGACY_API__: "false",
  __INTLIFY_PROD_DEVTOOLS__: "false",
  __VUE_PROD_DEVTOOLS__: "false",
};

const rows = [
  // group, name, fixture, external, define
  ["core", "@comvi/core", "comvi-core.ts", [], {}],
  ["core", "i18next", "i18next-core.ts", [], {}],
  ["core+icu", "@comvi/core + /icu", "comvi-core-icu.ts", [], {}],
  [
    "core+icu",
    "@comvi/core, same plural text, simple compiler (no ICU)",
    "comvi-core-plural-text-no-icu.ts",
    [],
    {},
  ],
  ["core+icu", "i18next + i18next-icu", "i18next-core-icu.ts", [], {}],
  ["core+icu", "i18next, same plural text, no i18next-icu", "i18next-core-plural-text.ts", [], {}],
  ["core+icu", "intl-messageformat alone", "intl-messageformat.ts", [], {}],
  [
    "core+icu",
    "use-intl/core (react external: its shared chunk imports cloneElement and isValidElement from react)",
    "use-intl-core.ts",
    REACT,
    {},
  ],
  ["react", "@comvi/react", "comvi-react.ts", REACT, {}],
  ["react", "@comvi/react + /icu", "comvi-react-icu.ts", REACT, {}],
  ["react", "i18next + react-i18next", "i18next-react.ts", REACT, {}],
  ["react", "use-intl (react)", "use-intl-react.ts", REACT, {}],
  ["react+icu+loader", "@comvi/react + /icu + cdnLoader", "comvi-react-icu-cdn.ts", REACT, {}],
  [
    "react+icu+loader",
    "i18next + react-i18next + icu + http-backend",
    "i18next-react-icu-http.ts",
    REACT,
    {},
  ],
  ["vue", "@comvi/vue", "comvi-vue.ts", VUE, {}],
  ["vue", "@comvi/vue + /icu", "comvi-vue-icu.ts", VUE, {}],
  ["vue", "vue-i18n (lean flags, runtime compiler kept)", "vue-i18n.ts", VUE, VUE_I18N_LEAN],
  [
    "vue",
    "vue-i18n (lean flags, precompiled message function, compiler dropped)",
    "vue-i18n-precompiled.ts",
    VUE,
    { ...VUE_I18N_LEAN, __INTLIFY_DROP_MESSAGE_COMPILER__: "true" },
  ],
  ["next-client", "@comvi/next/client", "comvi-next-client.ts", NEXT, {}],
  ["next-client", "@comvi/next/client + /icu", "comvi-next-client-icu.ts", NEXT, {}],
  ["next-client", "next-intl (client)", "next-intl-client.ts", NEXT, {}],
  // Comvi-only rows that mirror the size gate's fixtures and externals exactly, so every Comvi
  // figure a page cites comes from the published tarballs through this one configuration.
  [
    "comvi-only",
    "@comvi/next root composed (fw-next-root-composed)",
    "comvi-next-root-composed.ts",
    NEXT,
    {},
  ],
  [
    "comvi-only",
    "@comvi/next/server provider (fw-next-server-provider)",
    "comvi-next-server-provider.ts",
    [...NEXT, "@comvi/next/config", "*/client/ComviClientProvider.js"],
    {},
  ],
  [
    "comvi-only",
    "@comvi/next/middleware (fw-next-middleware-edge)",
    "comvi-next-middleware-edge.ts",
    ["next", "next/*"],
    {},
  ],
  [
    "comvi-only",
    "@comvi/nuxt client runtime (fw-nuxt-client-default)",
    "comvi-nuxt-client-default.ts",
    NUXT_EXT,
    NUXT_DEFINE,
  ],
  [
    "comvi-only",
    "@comvi/nuxt/i18n entry, nothing external (fw-nuxt-i18n)",
    "comvi-nuxt-i18n.ts",
    [],
    {},
  ],
  [
    "comvi-only",
    "@comvi/nuxt everything composed (fw-nuxt-full-composite)",
    "comvi-nuxt-full-composite.ts",
    [...NUXT_EXT, "#comvi/*"],
    NUXT_DEFINE,
  ],
];

const out = [];
for (const [group, name, fixture, external, define] of rows) {
  const r = await esbuild.build({
    entryPoints: [path.join("fixtures", fixture)],
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    logLevel: "silent",
    conditions: CONDITIONS,
    external,
    define: { __DEV__: "false", "process.env.NODE_ENV": JSON.stringify("production"), ...define },
  });
  const code = r.outputFiles[0].contents;
  const gz = zlib.gzipSync(code, { level: 9 }).byteLength;
  const pkgs = new Set();
  const inputFiles = Object.keys(r.metafile.inputs);
  for (const f of inputFiles) {
    const m = f.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
    if (m) pkgs.add(m[1]);
  }
  out.push({
    group,
    name,
    fixture,
    external,
    define,
    minBytes: code.byteLength,
    gzipBytes: gz,
    packages: [...pkgs].sort(),
    inputFiles,
  });
}
// Versions come from the pnpm store path of every file that landed in a bundle
// (node_modules/.pnpm/<name>@<version>[_peers]/...), per row, so a transitive
// package that resolves to a different major in two bundles is reported as such.
// A package installed from a local tarball gets a store path of the form
// `<name>@file+<path hash>` instead of a version, which is what a pre-publish run
// of this harness produces for the `@comvi/*` packages; the version is then read
// from the installed `package.json`, which is the manifest npm would publish.
function versionsOf(inputFiles) {
  const versions = {};
  for (const f of inputFiles) {
    const m = f.match(/\.pnpm\/([^/]+)\/node_modules\//);
    if (!m) continue;
    const seg = m[1].split("_")[0];
    const at = seg.lastIndexOf("@");
    const name = seg.slice(0, at).replace("+", "/");
    const version = seg.slice(at + 1);
    versions[name] = /^\d/.test(version) ? version : readInstalledVersion(name, version);
  }
  return versions;
}
function readInstalledVersion(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join("node_modules", name, "package.json"), "utf8"))
      .version;
  } catch {
    return fallback;
  }
}
for (const o of out) {
  o.versions = versionsOf(o.inputFiles);
  delete o.inputFiles;
}
// Local calendar date, so a run just after midnight is filed under the day it was made.
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
fs.writeFileSync(
  `results-${date}.json`,
  JSON.stringify(
    {
      measuredAt: date,
      node: process.version,
      loadAverage: os.loadavg(),
      esbuild: esbuild.version,
      conditions: CONDITIONS,
      rows: out,
    },
    null,
    2,
  ) + "\n",
);
// The Node version is part of the measurement: esbuild emits the same minified bytes on
// any Node, but zlib does not gzip them to the same size on every Node major, so a figure
// is only comparable with another taken on the same Node. It heads both outputs.
let md =
  `<!-- node ${process.version} | esbuild ${esbuild.version} | ${os.platform()} ${os.arch()} | load ${os
    .loadavg()
    .map((n) => n.toFixed(2))
    .join(" ")} | measured ${date} -->\n\n` +
  `node ${process.version}, esbuild ${esbuild.version}, gzip level 9, measured ${date}.\n\n` +
  "| Group | Bundle | min B | min+gz B | Packages in the bundle |\n|---|---|---:|---:|---|\n";
for (const o of out)
  md += `| ${o.group} | ${o.name} | ${o.minBytes.toLocaleString("en-US")} | ${o.gzipBytes.toLocaleString("en-US")} | ${Object.entries(
    o.versions,
  )
    .map(([k, v]) => `${k}@${v}`)
    .join(", ")} |\n`;
fs.writeFileSync(`results-${date}.md`, md);
console.log(
  `node ${process.version} | esbuild ${esbuild.version} | ${os.platform()} ${os.arch()} | load ${os
    .loadavg()
    .map((n) => n.toFixed(2))
    .join(" ")}`,
);
let g = "";
for (const o of out) {
  if (o.group !== g) {
    g = o.group;
    console.log(`\n## ${g}`);
  }
  console.log(
    `${o.name.padEnd(56)} min ${String(o.minBytes).padStart(7)}  gz ${String(o.gzipBytes).padStart(6)}   [${o.packages.join(", ")}]`,
  );
}
