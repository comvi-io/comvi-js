// What Next's server layer does to a `"use client"` module, for the matrix
// cases that model that layer (`conditions: ["react-server"]`).
//
// Next's flight loader replaces such a module with client-reference proxies:
// the server graph keeps its export NAMES and never follows its imports. A
// plain bundler under `react-server` does follow them, into `react` hooks the
// `react-server` build does not export, so `@comvi/next/server` (whose
// `ComviProvider` renders the library's `"use client"` provider) would fail to
// bundle for a reason Next never hits. Only that transform is modelled:
// resolution, conditions and `sideEffects` stay stock.

const DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;

/** The names a preserved-module dist file exports, from its `export { … }` lists. */
function exportNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/\bexport\s+(?:function|const|let|class)\s+([\w$]+)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

/** The proxy module for a `"use client"` source, or `null` for any other module. */
export function clientReference(source, id) {
  if (!DIRECTIVE.test(source)) return null;
  const names = exportNames(source);
  if (names.length === 0) throw new Error(`client reference ${id} exports nothing`);
  const lines = names.map((name) => {
    const local = name === "default" ? "__default" : name;
    const decl = `const ${local} = { $$typeof: Symbol.for("react.client.reference"), $$id: ${JSON.stringify(`${id}#${name}`)} };`;
    return name === "default" ? `${decl}\nexport default ${local};` : `export ${decl}`;
  });
  return `// client reference (bundler-matrix model of Next's flight loader)\n${lines.join("\n")}\n`;
}

/** Webpack loader form. */
export default function clientReferenceLoader(source) {
  return clientReference(source, this.resourcePath) ?? source;
}
