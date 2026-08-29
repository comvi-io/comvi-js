/**
 * The single-entry convergence transforms (`.omc/plans/comvi-single-entry.md`
 * §7.2) and the residuals §7.3 owns.
 *
 * | 1 | `@comvi/<pkg>/slim` -> `@comvi/<pkg>` | the retired host tier        |
 * | 2 | `createSlimI18n` -> `createI18n`      | never published, so renamed  |
 * | 3 | chained `.use(X(o))`                  | installer, or plugins()+use  |
 * | 4 | inline ICU catalog                    | `compiler: icuCompiler`      |
 * | 5 | `exposeGlobal` / `instanceId` options | `.with(devtools({…}))`       |
 * | 6 | non-flat inline catalog               | `flattenCatalog(…)`          |
 * | + | `.with(icu())` after a loader         | moved BEFORE it (§7.3)       |
 *
 * TWO invariants make this safe to run on someone else's app:
 *
 *   • THE CHAIN IS THE UNIT. Everything here reasons about ONE static
 *     expression — `createI18n(opts)` plus the `.use` / `.with` calls chained
 *     directly onto it — because that is the only shape where evaluation order
 *     is visible in the text. One undecidable member (a spread, a stored
 *     plugin, a factory that is not imported by name) refuses the WHOLE chain
 *     and reports it: a half-migrated chain silently reorders capability
 *     installation, which is worse than not migrating it at all.
 *   • EVERY EDIT IS A SPLICE OF THE ORIGINAL TEXT. Options move by copying
 *     their own source text, catalogs are wrapped rather than rebuilt, and the
 *     `.with(icu())` reorder moves the user's own characters. Comments,
 *     formatting, directive prologues, shebangs and CRLF survive because
 *     nothing is ever re-printed from the tree.
 *
 * The host is resolved through the IMPORT, never by name: a `createI18n` that
 * comes from a local factory is not this API and is left alone, and
 * `import { createI18n as make }` is followed through its alias.
 */
import {
  CORE_SUBPATH_OF,
  DEVTOOLS_INSTALLER,
  DEVTOOLS_OPTIONS,
  DEVTOOLS_PROVIDERS,
  FLATTEN_CATALOG,
  HOST_CLASS,
  HOST_FACTORY,
  ICU_COMPILER,
  ICU_INSTALLER,
  LOADER_INSTALLERS,
  PLUGIN_HOST_INSTALLER,
  PLUGIN_HOST_PROVIDERS,
  PLUGIN_INSTALLERS,
  PLUGIN_FACTORY_MODULES,
  SLIM_HOST_FACTORY,
  SLIM_SUBPATH,
} from "./capabilities.mjs";
import { icuArgumentType } from "./icu-syntax.mjs";
import {
  bindingState,
  importedBinding,
  localDeclarations,
  moduleOf,
  namedImports,
  planNamedImports,
} from "./imports.mjs";
import { braceListInsertion, braceListMembers, braceListRemoval } from "./script-blocks.mjs";
import { scopeOf } from "./scope.mjs";

const HOST_MODULES = new Set([
  "@comvi/core",
  "@comvi/react",
  "@comvi/solid",
  "@comvi/svelte",
  "@comvi/vue",
  "@comvi/next/client",
  "@comvi/next/server",
]);

const spanOf = (node) => ({ start: node.range().start.index, end: node.range().end.index });
const startOf = (node) => node.range().start.index;

/** One line of a node's text, for a report a human reads. */
function brief(node) {
  const flat = node.text().replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/** The argument expressions of a call, comments and punctuation excluded. */
function argumentsOf(call) {
  const args = call.field("arguments");
  return args === null ? [] : braceListMembers(args);
}

/** The name a call invokes, when that is a plain identifier. */
function calleeName(node) {
  if (node === undefined || node === null || node.kind() !== "call_expression") return undefined;
  const callee = node.field("function");
  return callee !== null && callee.kind() === "identifier" ? callee.text() : undefined;
}

/**
 * The name a host CONSTRUCTION invokes — `createI18n(o)` and `new I18n(o)` are
 * the same host and carry the same options, so both are migrated.
 */
function constructedName(node) {
  const kind = node.kind();
  if (kind !== "call_expression" && kind !== "new_expression") return undefined;
  const callee = node.field(kind === "call_expression" ? "function" : "constructor");
  return callee !== null && callee.kind() === "identifier" ? callee.text() : undefined;
}

/** What a proven `.with(x)` installs: `plugins()` and `attachPlugins` both. */
function installedBy(root, step, hostModule) {
  const args = argumentsOf(step.call);
  if (args.length !== 1) return undefined;
  const argument = args[0];
  const name =
    calleeName(argument) ?? (argument.kind() === "identifier" ? argument.text() : undefined);
  if (name === undefined) return undefined;

  const binding = importedBinding(root, name);
  if (binding === undefined || binding.typeOnly) return undefined;
  const api = binding.imported;
  const coreModule = CORE_SUBPATH_OF.get(api);
  const pluginEntry = [...PLUGIN_INSTALLERS].find(([, installer]) => installer === api);
  const owner = pluginEntry === undefined ? undefined : PLUGIN_FACTORY_MODULES.get(pluginEntry[0]);
  const fromHost = hostModule !== "@comvi/core" && binding.source === hostModule;
  return binding.source === coreModule || binding.source === owner || fromHost ? api : undefined;
}

const keyText = (key) => (key.kind() === "string" ? key.text().slice(1, -1) : key.text());

/**
 * The statically named properties of an object literal. A spread or a computed
 * key contributes nothing: it is not evidence FOR a shape and never evidence
 * against one, so the rules below simply do not see it.
 */
function objectProperties(objectNode) {
  const properties = [];
  for (const member of braceListMembers(objectNode)) {
    if (member.kind() === "pair") {
      const key = member.field("key");
      if (key === null || key.kind() === "computed_property_name") continue;
      properties.push({ key: keyText(key), member, value: member.field("value") });
      continue;
    }
    if (member.kind() === "shorthand_property_identifier") {
      properties.push({ key: member.text(), member, value: undefined });
    }
  }
  return properties;
}

/** First spread/computed member in an object tree, if static inspection is incomplete. */
function firstOpaqueMember(objectNode, recursive = true) {
  for (const member of braceListMembers(objectNode)) {
    if (member.kind() === "spread_element") return member;
    if (member.kind() !== "pair") continue;
    const key = member.field("key");
    if (key?.kind() === "computed_property_name") return member;
    const value = member.field("value");
    if (recursive && value?.kind() === "object") {
      const nested = firstOpaqueMember(value);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/**
 * The `.use` / `.with` calls chained DIRECTLY onto `call`, in evaluation order.
 *
 * The walk stops at the first link that is anything else (`.init()`,
 * `.setLocale()`, a property read): everything past it is a different
 * expression, and appending an installer there would change what the chain
 * evaluates to.
 */
function chainSteps(call) {
  const steps = [];
  let node = call;
  for (;;) {
    const member = node.parent();
    if (member === null || member.kind() !== "member_expression") break;
    const object = member.field("object");
    const property = member.field("property");
    if (object === null || property === null) break;
    if (startOf(object) !== startOf(node)) break;
    const method = property.text();
    if (method !== "use" && method !== "with") break;
    const outer = member.parent();
    if (outer === null || outer.kind() !== "call_expression") break;
    if (startOf(outer.field("function")) !== startOf(member)) break;
    steps.push({ method, object, property, call: outer });
    node = outer;
  }
  return steps;
}

/** The construction a `.use` / `.with` chain starts from. */
function chainRootOf(node) {
  let current = node;
  while (current.kind() === "call_expression") {
    const callee = current.field("function");
    if (callee === null || callee.kind() !== "member_expression") return current;
    const object = callee.field("object");
    if (object === null) return current;
    current = object;
  }
  return current;
}

/**
 * The whitespace a chain puts in FRONT of a `.` — `""` for a one-liner, a
 * newline plus indent for the broken-out form.
 *
 * Every installer this module adds is inserted with the gap its neighbours use,
 * so a migrated chain reads the way the author wrote theirs instead of growing
 * one very long line for the formatter to find later.
 */
function chainGap(text, step) {
  const between = text.slice(step.object.range().end.index, startOf(step.property));
  return /^\s*/.exec(between)[0];
}

/** Local names that construct a host: the factory, its twin, and the class. */
function hostBindings(root) {
  const hosts = new Map();
  const constructors = [HOST_FACTORY, SLIM_HOST_FACTORY, HOST_CLASS];
  for (const entry of namedImports(root)) {
    if (!constructors.includes(entry.imported) || entry.typeOnly) continue;
    if (!HOST_MODULES.has(entry.source)) continue;
    hosts.set(entry.local, entry.source);
  }
  return hosts;
}

/** Host constructions whose import shape/provenance cannot be rewritten safely. */
function detectUnprovenHostConstructions(root) {
  const findings = [];
  const constructors = new Set([HOST_FACTORY, SLIM_HOST_FACTORY, HOST_CLASS]);
  const unsupported = new Map();
  for (const entry of namedImports(root)) {
    if (!constructors.has(entry.imported)) continue;
    if (entry.typeOnly || !HOST_MODULES.has(entry.source)) unsupported.set(entry.local, entry);
  }

  const namespaces = new Map();
  for (const declaration of root.findAll({ rule: { kind: "import_statement" } })) {
    const namespace = declaration.find({ rule: { kind: "namespace_import" } });
    const match =
      namespace === null ? undefined : /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(namespace.text());
    if (match !== undefined && match !== null) {
      namespaces.set(match[1], { declaration, source: moduleOf(declaration) });
    }
  }

  const constructions = [
    ...root.findAll({ rule: { kind: "call_expression" } }),
    ...root.findAll({ rule: { kind: "new_expression" } }),
  ];
  for (const call of constructions) {
    const direct = unsupported.get(constructedName(call) ?? "");
    if (direct !== undefined) {
      findings.push({
        offset: startOf(call),
        shape: "unproven-host-source",
        detail: `\`${direct.local}\` is not a value import from a supported Comvi host entry — this construction is left untouched`,
      });
      continue;
    }

    const callee = call.field(call.kind() === "call_expression" ? "function" : "constructor");
    if (callee?.kind() !== "member_expression") continue;
    const object = callee.field("object");
    const property = callee.field("property");
    if (
      object?.kind() !== "identifier" ||
      property === null ||
      !constructors.has(property.text())
    ) {
      continue;
    }
    const namespace = namespaces.get(object.text());
    if (namespace === undefined) continue;
    findings.push({
      offset: startOf(call),
      shape: "namespace-host-factory",
      detail:
        `\`${callee.text()}(…)\` comes through a namespace import from ` +
        `"${namespace.source ?? "an unknown module"}" — use a named host import and re-run`,
    });
  }

  for (const declaration of root.findAll({ rule: { kind: "export_statement" } })) {
    const source = moduleOf(declaration);
    if (source === undefined || !HOST_MODULES.has(source)) continue;
    for (const specifier of declaration.findAll({ rule: { kind: "export_specifier" } })) {
      const exported = specifier.find({ rule: { kind: "identifier" } });
      if (exported?.text() !== SLIM_HOST_FACTORY) continue;
      findings.push({
        offset: startOf(specifier),
        shape: "retired-host-reexport",
        detail:
          `\`${SLIM_HOST_FACTORY}\` is re-exported from "${source}" — replace the re-export ` +
          `with \`${HOST_FACTORY}\` by hand`,
      });
    }
  }

  for (const declarator of root.findAll({ rule: { kind: "variable_declarator" } })) {
    const pattern = declarator.field("name");
    let value = declarator.field("value");
    if (pattern === null || value === null) continue;
    if (value.kind() === "await_expression") {
      value = value.find({ rule: { kind: "call_expression" } });
    }
    if (value?.kind() !== "call_expression") continue;
    const loader = value.field("function")?.text();
    if (loader !== "import" && loader !== "require") continue;
    const sourceNode = argumentsOf(value)[0];
    const source = sourceNode?.kind() === "string" ? sourceNode.text().slice(1, -1) : undefined;
    if (source === undefined || !HOST_MODULES.has(source)) continue;

    const boundNames = new Set(
      pattern
        .findAll({ rule: { kind: "shorthand_property_identifier_pattern" } })
        .map((node) => node.text()),
    );
    if (pattern.kind() === "identifier") boundNames.add(pattern.text());
    const destructuredConstructor = [...boundNames].find((name) => constructors.has(name));
    if (pattern.kind() === "object_pattern" && destructuredConstructor !== undefined) {
      findings.push({
        offset: startOf(declarator),
        shape: loader === "import" ? "dynamic-host-import" : "cjs-host-import",
        detail:
          `a host constructor is destructured from ${loader}("${source}") — use a static ` +
          `named host import and re-run`,
      });
    }
    if (pattern.kind() === "identifier") {
      for (const call of constructions) {
        const callee = call.field(call.kind() === "call_expression" ? "function" : "constructor");
        if (
          callee?.kind() !== "member_expression" ||
          callee.field("object")?.text() !== pattern.text() ||
          !constructors.has(callee.field("property")?.text())
        ) {
          continue;
        }
        findings.push({
          offset: startOf(call),
          shape: loader === "import" ? "dynamic-host-import" : "cjs-host-import",
          detail:
            `\`${callee.text()}(…)\` comes through ${loader}("${source}") — use a static ` +
            `named host import and re-run`,
        });
      }
    }
  }
  return findings;
}

/**
 * Where a capability binding comes from, given the module the HOST came from.
 * Core keeps one capability per pure subpath (§2.4); every wrapper package
 * re-exports all of them from its single entry. A host imported from anywhere
 * else is undecidable — the codemod will not guess a user's barrel file.
 */
function bindingModule(hostModule, name) {
  if (hostModule === "@comvi/core") return CORE_SUBPATH_OF.get(name);
  return hostModule.startsWith("@comvi/") ? hostModule : undefined;
}

/** Identifier references to `name`; imported/exported property names are not bindings here. */
function referencesOf(root, name) {
  return root
    .findAll({ rule: { kind: "identifier", regex: `^${name}$` } })
    .filter(
      (node) =>
        node.parent()?.kind() !== "import_specifier" &&
        node.parent()?.kind() !== "export_specifier",
    );
}

// ---------------------------------------------------------------------------
// §7.2-1 — module specifiers
// ---------------------------------------------------------------------------

/** Static ESM specifiers; dynamic imports and `require` need a manual cutover. */
function moduleSpecifiers(root) {
  const found = [];
  for (const kind of ["import_statement", "export_statement"]) {
    for (const declaration of root.findAll({ rule: { kind } })) {
      const node = declaration.field("source");
      if (node === null || node.kind() !== "string") continue;
      found.push({
        declaration,
        value: node.text().slice(1, -1),
        start: startOf(node) + 1,
        end: node.range().end.index - 1,
      });
    }
  }
  return found;
}

function detectDynamicSlimSpecifiers(root) {
  const findings = [];
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    const loader = call.field("function")?.text();
    if (loader !== "import" && loader !== "require") continue;
    const source = argumentsOf(call)[0];
    if (source?.kind() !== "string" || SLIM_SUBPATH.exec(source.text().slice(1, -1)) === null) {
      continue;
    }
    findings.push({
      offset: startOf(call),
      shape: "dynamic-slim-specifier",
      detail:
        `\`${loader}(${source.text()})\` uses a retired /slim entry — migrate the module ` +
        `specifier and any \`${SLIM_HOST_FACTORY}\` access together by hand`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// §7.2-2 — the host-factory rename
// ---------------------------------------------------------------------------

/**
 * Plans `createSlimI18n` -> `createI18n` for the whole file, or refuses it.
 *
 * The refusal is file-wide because the rename is: renaming half the references
 * would break the file. An alias (`import { createSlimI18n as make }`) renames
 * the IMPORTED name only — `make` is the user's own name and stays.
 */
function planHostRename(root) {
  const specifiers = namedImports(root).filter((entry) => entry.imported === SLIM_HOST_FACTORY);
  if (specifiers.length === 0) return { edits: [], manual: [], renames: 0 };

  const manual = [];
  const taken =
    importedBinding(root, HOST_FACTORY)?.specifier ?? localDeclarations(root, HOST_FACTORY)[0];
  if (taken !== undefined) {
    manual.push({
      offset: startOf(taken),
      shape: "slim-rename-blocked",
      detail: `\`${HOST_FACTORY}\` is already bound in this module — rename \`${SLIM_HOST_FACTORY}\` by hand`,
    });
  }
  const shadow = localDeclarations(root, SLIM_HOST_FACTORY)[0];
  if (shadow !== undefined) {
    manual.push({
      offset: startOf(shadow),
      shape: "slim-rename-blocked",
      detail: `\`${SLIM_HOST_FACTORY}\` is shadowed by another binding — rename the imported factory by hand`,
    });
  }
  for (const declaration of root.findAll({ rule: { kind: "export_statement" } })) {
    if (moduleOf(declaration) !== undefined) continue;
    for (const specifier of declaration.findAll({ rule: { kind: "export_specifier" } })) {
      const local = specifier.find({ rule: { kind: "identifier" } });
      if (local?.text() !== SLIM_HOST_FACTORY) continue;
      manual.push({
        offset: startOf(specifier),
        shape: "slim-rename-blocked",
        detail: `\`${SLIM_HOST_FACTORY}\` is locally re-exported — rename the import, references and export by hand`,
      });
    }
  }
  for (const shorthand of root.findAll({
    rule: { kind: "shorthand_property_identifier", regex: `^${SLIM_HOST_FACTORY}$` },
  })) {
    manual.push({
      offset: startOf(shorthand),
      shape: "slim-rename-blocked",
      detail: `\`{ ${SLIM_HOST_FACTORY} }\` is an object shorthand — the rename would rename its KEY too`,
    });
  }
  if (manual.length > 0) return { edits: [], manual, renames: 0 };

  const edits = [];
  for (const entry of specifiers) {
    edits.push({ ...spanOf(entry.name), text: HOST_FACTORY });
    if (entry.alias !== null) continue; // `as make`: the local name is the user's
    for (const reference of referencesOf(root, entry.local)) {
      edits.push({ ...spanOf(reference), text: HOST_FACTORY });
    }
  }
  return { edits, manual, renames: edits.length };
}

// ---------------------------------------------------------------------------
// §7.3 — `.use` that never reaches a static chain
// ---------------------------------------------------------------------------

/**
 * `.use(…)` on a STORED host: `const i18n = createI18n(…); i18n.use(p)`, the
 * conditional `if (dev) i18n.use(p)`, and every loop or array around them.
 *
 * The base host has no `.use` at all, so these break loudly at runtime — but
 * the fix is a change at CONSTRUCTION, which is not where the call is, so they
 * are reported with the recipe rather than rewritten. Two guards keep the
 * report worth reading: only bindings the file itself assigns from a host
 * construction count (`app.use(router)` in a component is not this shape), and
 * a construction that already composes the plugin host is already correct.
 */
function detectStoredHostUse(root, hosts) {
  const findings = [];
  for (const declarator of root.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name === null || value === null || name.kind() !== "identifier") continue;

    const construction = chainRootOf(value);
    const hostModule = hosts.get(constructedName(construction) ?? "");
    if (hostModule === undefined) continue;
    const composed = chainSteps(construction).some(
      (step) =>
        step.method === "with" &&
        PLUGIN_HOST_PROVIDERS.includes(installedBy(root, step, hostModule)),
    );
    if (composed) continue;

    const binding = name.text();
    for (const access of scopeOf(declarator).findAll({ rule: { kind: "member_expression" } })) {
      if (access.field("object")?.text() !== binding) continue;
      if (access.field("property")?.text() !== "use") continue;
      if (access.parent()?.kind() !== "call_expression") continue;
      findings.push({
        offset: startOf(access),
        shape: "stored-host-plugin-use",
        detail:
          `\`${binding}.use(…)\` runs on a stored \`${HOST_FACTORY}(…)\` result, and the base ` +
          `host has no \`use\` — compose \`.with(${PLUGIN_HOST_INSTALLER}())\` (or a lowercase ` +
          `installer) where the host is constructed`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * @returns {{ edits: Array<{start:number,end:number,text:string}>,
 *             manual: Array<{offset:number,shape:string,detail:string}>,
 *             transforms: Map<string, number>,
 *             prunable: string[] }}
 */
export function planSingleEntry(root, text) {
  const edits = [];
  const manual = [];
  const transforms = new Map();
  const prunable = new Set();
  const needs = new Map();
  const count = (kind, amount = 1) => transforms.set(kind, (transforms.get(kind) ?? 0) + amount);

  const rename = planHostRename(root);
  edits.push(...rename.edits);
  manual.push(...rename.manual, ...detectDynamicSlimSpecifiers(root));
  if (rename.renames > 0) count("slim-factory-rename", rename.renames);

  for (const specifier of moduleSpecifiers(root)) {
    const match = SLIM_SUBPATH.exec(specifier.value);
    if (match === null) continue;
    const namespace = specifier.declaration.find({ rule: { kind: "namespace_import" } });
    const retiredExport = specifier.declaration
      .findAll({ rule: { kind: "export_specifier" } })
      .some((entry) => entry.find({ rule: { kind: "identifier" } })?.text() === SLIM_HOST_FACTORY);
    const blockedRename =
      rename.manual.length > 0 &&
      specifier.declaration
        .findAll({ rule: { kind: "import_specifier" } })
        .some((entry) => entry.field("name")?.text() === SLIM_HOST_FACTORY);
    if (namespace !== null || retiredExport || blockedRename) {
      if (namespace !== null) {
        manual.push({
          offset: startOf(namespace),
          shape: "namespace-slim-specifier",
          detail:
            `namespace import from "${specifier.value}" may access \`${SLIM_HOST_FACTORY}\` — ` +
            `migrate the specifier and property accesses together by hand`,
        });
      }
      if (retiredExport) {
        manual.push({
          offset: startOf(specifier.declaration),
          shape: "retired-host-reexport",
          detail:
            `\`${SLIM_HOST_FACTORY}\` is re-exported from "${specifier.value}" — rename the ` +
            `export and its module specifier together by hand`,
        });
      }
      continue;
    }
    edits.push({ start: specifier.start, end: specifier.end, text: match[1] });
    count("slim-specifier");
  }

  manual.push(...detectUnprovenHostConstructions(root));

  const hosts = hostBindings(root);
  manual.push(...detectStoredHostUse(root, hosts));

  const constructions = [
    ...root.findAll({ rule: { kind: "call_expression" } }),
    ...root.findAll({ rule: { kind: "new_expression" } }),
  ];
  for (const call of constructions) {
    const hostModule = hosts.get(constructedName(call) ?? "");
    if (hostModule === undefined) continue;

    const chain = planChain(root, text, call, hostModule);
    manual.push(...chain.manual);
    if (chain.blocked) continue;
    edits.push(...chain.edits);
    for (const [kind, amount] of chain.transforms) count(kind, amount);
    for (const [name, module] of chain.needs) needs.set(name, module);
    for (const name of chain.prunable) prunable.add(name);
  }

  const imports = planNamedImports(root, text, needs);
  edits.push(...imports.edits);
  manual.push(...imports.manual);

  return { edits, manual: dedupeFileLevel(manual), transforms, prunable: [...prunable] };
}

/**
 * A name shadowed in a file is shadowed for every chain in it, and a host module
 * the codemod cannot place an import into is the same fact once. Forty copies of
 * one truth is a report nobody reads, so these two shapes report their first
 * occurrence and stop; every other shape is per-call-site and stays.
 */
function dedupeFileLevel(manual) {
  const seen = new Set();
  return manual.filter((item) => {
    if (item.shape !== "local-name-collision" && item.shape !== "manual-import") return true;
    const key = `${item.shape}\u0000${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Plans one `createI18n(…)` expression: its options object and the `.use` /
 * `.with` chain hanging off it.
 *
 * `blocked` means the chain comes back byte-identical and `manual` says why.
 */
function planChain(root, text, call, hostModule) {
  const edits = [];
  const blockers = [];
  const advisories = [];
  const transforms = new Map();
  const prunable = new Set();
  const needs = new Map();
  const count = (kind, amount = 1) => transforms.set(kind, (transforms.get(kind) ?? 0) + amount);
  const refuse = () => ({ blocked: true, manual: blockers, edits: [] });

  const steps = chainSteps(call);
  const options = argumentsOf(call)[0];

  // --- the chain: what does it already compose, and where? ------------------
  let pluginHostAt;
  let icuStep;
  let devtoolsStep;
  let loaderStep;
  let firstUnknownUse;

  for (const step of steps) {
    if (step.method === "with") {
      const installer = installedBy(root, step, hostModule);
      if (installer === undefined) continue;
      if (PLUGIN_HOST_PROVIDERS.includes(installer) && pluginHostAt === undefined) {
        pluginHostAt = steps.indexOf(step);
      }
      if (installer === ICU_INSTALLER && icuStep === undefined) icuStep = step;
      if (DEVTOOLS_PROVIDERS.includes(installer)) devtoolsStep = step;
      if (LOADER_INSTALLERS.includes(installer) && loaderStep === undefined) loaderStep = step;
      continue;
    }

    const args = argumentsOf(step.call);
    const factory = args.length === 1 ? args[0] : undefined;
    const local = calleeName(factory);
    if (local === undefined) {
      blockers.push({
        offset: startOf(step.property),
        shape: "dynamic-plugin-use",
        detail:
          `\`.use(${factory === undefined ? "…" : brief(factory)})\` is not a statically named ` +
          `plugin factory call — compose \`.with(${PLUGIN_HOST_INSTALLER}())\` and keep this ` +
          `\`.use(…)\` by hand`,
      });
      continue;
    }

    const installer = PLUGIN_INSTALLERS.get(local);
    if (installer === undefined) {
      // An unknown plugin keeps its `.use`; the host just has to gain one.
      if (firstUnknownUse === undefined) firstUnknownUse = step;
      continue;
    }

    const binding = importedBinding(root, local);
    const expectedModule = PLUGIN_FACTORY_MODULES.get(local);
    if (
      binding === undefined ||
      binding.typeOnly ||
      binding.imported !== local ||
      binding.source !== expectedModule
    ) {
      blockers.push({
        offset: startOf(step.property),
        shape: "ambiguous-plugin-factory",
        detail:
          `\`${local}\` is not a value import from "${expectedModule}" under its own name, so it ` +
          `cannot be proven to be the first-party factory — write \`.with(${installer}(…))\` by hand`,
      });
      continue;
    }

    edits.push({ ...spanOf(step.property), text: "with" });
    edits.push({ ...spanOf(factory.field("function")), text: installer });
    needs.set(installer, binding.source);
    prunable.add(local);
    count("plugin-installer");
    if (LOADER_INSTALLERS.includes(installer) && loaderStep === undefined) loaderStep = step;
  }

  if (blockers.length > 0) return refuse();

  // --- §7.2-3, unknown plugins: the generic host, once, before the first use -
  //
  // A lowercase installer this pass just wrote (`fetchLoader`) ensures the
  // plugin host itself, so the `plugins()` below is redundant beside one — and
  // it is emitted anyway, deliberately: attaching twice is a documented no-op,
  // while relying on another installer's RETURN TYPE to widen the host is a bet
  // on a signature this codemod does not own.
  if (firstUnknownUse !== undefined) {
    const already = pluginHostAt !== undefined && pluginHostAt < steps.indexOf(firstUnknownUse);
    if (!already) {
      const insertAt = firstUnknownUse.object.range().end.index;
      const gap = chainGap(text, firstUnknownUse);
      const install = `${gap}.with(${PLUGIN_HOST_INSTALLER}())`;
      edits.push({ start: insertAt, end: insertAt, text: install });
      needs.set(PLUGIN_HOST_INSTALLER, bindingModule(hostModule, PLUGIN_HOST_INSTALLER));
      count("plugin-host");
    }
  }

  // --- §7.3, safe ordering: `icu()` cannot run once a loader has ingested ----
  if (icuStep !== undefined && loaderStep !== undefined) {
    if (steps.indexOf(icuStep) > steps.indexOf(loaderStep)) {
      const from = icuStep.object.range().end.index;
      const to = icuStep.call.range().end.index;
      const before = loaderStep.object.range().end.index;
      edits.push({ start: from, end: to, text: "" });
      edits.push({ start: before, end: before, text: text.slice(from, to) });
      count("icu-before-loader");
    }
  }

  // --- the constructor options ----------------------------------------------
  const inline = options !== undefined && options.kind() === "object";
  const properties = inline ? objectProperties(options) : undefined;
  const opaqueOptions = inline ? firstOpaqueMember(options, false) : undefined;
  if (opaqueOptions !== undefined) {
    blockers.push({
      offset: startOf(opaqueOptions),
      shape: "opaque-host-options",
      detail:
        "inline host options contain a spread or computed member — check them by hand for " +
        `\`${DEVTOOLS_OPTIONS.join("` / `")}\`, ICU comma syntax and nested catalogs`,
    });
    return refuse();
  }
  if (options !== undefined && !inline) {
    advisories.push({
      offset: startOf(call),
      shape: "opaque-host-options",
      detail:
        `\`${HOST_FACTORY}(${brief(options)})\` options are not an inline object — check them by ` +
        `hand for \`${DEVTOOLS_OPTIONS.join("` / `")}\`, ICU comma syntax and nested catalogs`,
    });
  }

  const moved = properties?.filter(({ key }) => DEVTOOLS_OPTIONS.includes(key)) ?? [];
  const doomed = new Set(moved.map(({ member }) => startOf(member)));
  const isMoved = (member) => doomed.has(startOf(member));

  if (moved.length > 0 && devtoolsStep !== undefined) {
    blockers.push({
      offset: startOf(moved[0].member),
      shape: "devtools-options-conflict",
      detail:
        `\`${moved.map(({ key }) => key).join("`, `")}\` is a constructor option while the chain ` +
        `already composes \`${DEVTOOLS_INSTALLER}(…)\` — merge it into that call by hand`,
    });
    return refuse();
  }

  let compilerAdded = false;
  if (properties !== undefined) {
    const translation = properties.find(({ key }) => key === "translation");
    const catalogs = translation?.value?.kind() === "object" ? translation.value : undefined;
    const opaqueCatalog = catalogs === undefined ? undefined : firstOpaqueMember(catalogs);
    if (opaqueCatalog !== undefined) {
      blockers.push({
        offset: startOf(opaqueCatalog),
        shape: "opaque-host-options",
        detail:
          "inline translations contain a spread or computed member — check them by hand for " +
          "ICU comma syntax and nested keys",
      });
      return refuse();
    }
    const dynamicTemplate = catalogs?.find({ rule: { kind: "template_substitution" } });
    if (dynamicTemplate !== undefined && dynamicTemplate !== null) {
      blockers.push({
        offset: startOf(dynamicTemplate),
        shape: "opaque-host-options",
        detail:
          "inline translations contain an interpolated template — check the runtime value by hand " +
          "for ICU comma syntax and nested keys",
      });
      return refuse();
    }

    // A catalog assembled elsewhere is the SAME blind spot as opaque options,
    // and it is the common one: `translation: en` from a JSON module is exactly
    // the shape that silently loses ICU and flattening.
    if (translation !== undefined && catalogs === undefined) {
      advisories.push({
        offset: startOf(translation.member),
        shape: "opaque-host-options",
        detail:
          `\`${translation.member.text().split(/\s*:/)[0]}\` is not an inline catalog — check it ` +
          `by hand for ICU comma syntax and nested keys`,
      });
    }

    if (catalogs !== undefined && !properties.some(({ key }) => key === "compiler")) {
      if (firstIcuArgument(catalogs) !== undefined) {
        edits.push(braceListInsertion(options, [`compiler: ${ICU_COMPILER}`], isMoved));
        needs.set(ICU_COMPILER, bindingModule(hostModule, ICU_COMPILER));
        compilerAdded = true;
        count("inline-icu-compiler");
      }
    }

    for (const locale of catalogs === undefined ? [] : objectProperties(catalogs)) {
      const catalog = locale.value;
      if (catalog === undefined || catalog === null || catalog.kind() !== "object") continue;
      if (!objectProperties(catalog).some(({ value }) => value?.kind() === "object")) continue;
      edits.push({ ...spanOf(catalog), text: `${FLATTEN_CATALOG}(${catalog.text()})` });
      needs.set(FLATTEN_CATALOG, bindingModule(hostModule, FLATTEN_CATALOG));
      count("nested-catalog");
    }
  }

  // --- §7.2-5: the two options that became `devtools()` arguments ------------
  if (moved.length > 0) {
    edits.push(...braceListRemoval(options, isMoved));
    const last = steps[steps.length - 1];
    const tail = last === undefined ? call : last.call;
    const insertAt = tail.range().end.index;
    const gap = last === undefined ? "" : chainGap(text, last);
    const carried = moved.map(({ member }) => member.text()).join(", ");
    edits.push({
      start: insertAt,
      end: insertAt,
      text: `${gap}.with(${DEVTOOLS_INSTALLER}({ ${carried} }))`,
    });
    needs.set(DEVTOOLS_INSTALLER, bindingModule(hostModule, DEVTOOLS_INSTALLER));
    count("devtools-options");
  }

  // --- §7.3: the catalogs the codemod cannot read ----------------------------
  const compilerProven =
    compilerAdded ||
    icuStep !== undefined ||
    (properties?.some(({ key }) => key === "compiler") ?? false);
  if (loaderStep !== undefined && inline && !compilerProven) {
    advisories.push({
      offset: startOf(loaderStep.property),
      shape: "runtime-icu-unproven",
      detail:
        `this host loads catalogs at runtime and keeps the default compiler — if any loaded ` +
        `catalog uses ICU syntax, compose \`.with(${ICU_INSTALLER}())\` BEFORE the loader ` +
        `(the codemod cannot read remote catalogs)`,
    });
  }

  // --- every binding a rewrite introduced has to be placeable ---------------
  for (const [name, module] of needs) {
    const state = bindingState(root, name, module);
    if (state === "available") {
      needs.delete(name);
      continue;
    }
    if (state === "collision") {
      blockers.push({
        offset: startOf(call),
        shape: "local-name-collision",
        detail:
          `\`${name}\` is already declared locally — the \`${HOST_FACTORY}(…)\` chains in this ` +
          `file are left untouched`,
      });
      continue;
    }
    if (module === undefined) {
      blockers.push({
        offset: startOf(call),
        shape: "manual-import",
        detail:
          `\`${HOST_FACTORY}\` comes from "${hostModule}", so the codemod cannot place ` +
          `\`${name}\` — import it from your comvi binding and re-run`,
      });
    }
  }
  if (blockers.length > 0) return refuse();

  return { blocked: false, edits, manual: advisories, transforms, needs, prunable };
}

/**
 * Decode the static portion of a JS string/template literal without eval.
 * This intentionally handles the escape forms that can hide ICU's comma.
 */
function staticLiteralValue(leaf) {
  const raw = leaf.text();
  let value = "";
  for (let index = 1; index < raw.length - 1; index++) {
    const char = raw[index];
    if (char !== "\\") {
      value += char;
      continue;
    }
    const escape = raw[++index];
    if (escape === undefined) break;
    const simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" };
    if (escape in simple) {
      value += simple[escape];
      continue;
    }
    if (escape === "\n") continue;
    if (escape === "\r") {
      if (raw[index + 1] === "\n") index++;
      continue;
    }
    if (escape === "x" && /^[\da-fA-F]{2}$/.test(raw.slice(index + 1, index + 3))) {
      value += String.fromCodePoint(Number.parseInt(raw.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    if (escape === "u") {
      const braced = /^\{([\da-fA-F]+)\}/.exec(raw.slice(index + 1));
      if (braced !== null) {
        value += String.fromCodePoint(Number.parseInt(braced[1], 16));
        index += braced[0].length;
        continue;
      }
      const hex = raw.slice(index + 1, index + 5);
      if (/^[\da-fA-F]{4}$/.test(hex)) {
        value += String.fromCodePoint(Number.parseInt(hex, 16));
        index += 4;
        continue;
      }
    }
    value += escape;
  }
  return value;
}

/** The first ICU argument type in the VALUES of a fully static inline catalog. */
function firstIcuArgument(catalogs) {
  const visit = (value) => {
    if (value.kind() === "template_string") {
      if (value.find({ rule: { kind: "template_substitution" } }) !== null) return undefined;
      return icuArgumentType(staticLiteralValue(value));
    }
    if (value.kind() === "string") return icuArgumentType(staticLiteralValue(value));
    if (value.kind() !== "object") return undefined;
    for (const property of objectProperties(value)) {
      const argument = visit(property.value);
      if (argument !== undefined) return argument;
    }
    return undefined;
  };

  return visit(catalogs);
}
