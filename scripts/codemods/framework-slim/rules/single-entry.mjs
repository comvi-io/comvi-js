/**
 * The single-entry convergence transforms.
 *
 * | 1 | `@comvi/<pkg>/slim` -> `@comvi/<pkg>` | the retired host tier        |
 * | 2 | `createSlimI18n` -> `createI18n`      | never published, so renamed  |
 * | 3 | chained `.use(X(o))`                  | `.use(x(o))` / definePlugin  |
 * | 4 | inline ICU catalog                    | `compiler: icuCompiler`      |
 * | 5 | `exposeGlobal` / `instanceId` options | `.use(devtools({…}))`        |
 * | 6 | `.with(installer)`, chained or stored | `.use(installer)`            |
 * | 7 | `host.use(raw)` on a plugin host      | `host.registerPlugin(raw)`   |
 * | 8 | `flattenCatalog` from a moved entry   | imported from `@comvi/core`  |
 * | 9–13 | the `createNextI18n(…)` result     | see `next-result.mjs`        |
 * | 14 | a bare `loader()` on a proven host   | `attachLoader`, bare         |
 * | + | `.with(icu())`, anywhere in a chain   | reported, never rewritten    |
 * | + | `.with(` on an unprovable receiver    | reported, never rewritten    |
 * | + | a bare `loader()` anywhere else       | reported, never rewritten    |
 *
 * A NESTED INLINE CATALOG is not on this table, and that is the point: the base
 * host flattens it itself, on every host, so `{ en: { nav: { home } } }` needs
 * no rewrite, no advisory and no manual item. Row 8 is all that is left of the
 * flattener — it moved to the `@comvi/core` root, so only its IMPORT migrates.
 *
 * Rows 6 and 7 are the two verbs converging (decision E). `.use(installer)` is
 * the only composition verb now, so the 0.5-pre `.with` spelling is renamed —
 * same argument, same position, nothing else about the chain moves — and the
 * raw plugin queue that used to be spelled `use` is `registerPlugin`, which is
 * where a `.use(rawPlugin)` on a PROVEN plugin host goes. A `.use(rawPlugin)`
 * inside a chain takes the other road and becomes `.use(definePlugin(raw))`,
 * because `definePlugin(fn)` attaches the capability itself and so needs
 * nothing in front of it.
 *
 * Row 14 is decision P3: `loader(importMap)` REQUIRES its map now, so a bare
 * `loader()` — attach-only against the 0.5 pre-release, and the third spelling
 * of one capability — becomes the bare `attachLoader` it always delegated to.
 * The argument changes, nothing else does, and the import-map adapter the
 * static reference dragged in leaves the graph with it. Where the receiver is
 * not provable the call is REPORTED instead, because it no longer compiles and
 * silence would certify a file that cannot build.
 *
 * Row `+` is the one shape here that has no rewrite. `.with(icu())` was a real
 * installer during 0.5 development and is not part of the released surface: ICU
 * is a compiler setting, so the fix is `compiler: icuCompiler` in the
 * constructor options, and `icu(myOwnCompiler)` means the codemod cannot know
 * which compiler to name. So the chain is refused whole and reported.
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
 *     their own source text; a catalog is never rebuilt, and after the base
 *     host took over flattening it is never even touched. Comments,
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
  FLATTEN_CATALOG_MOVED_FROM,
  HOST_CLASS,
  HOST_FACTORY,
  ICU_COMPILER,
  LOADER_ATTACH_INSTALLER,
  LOADER_INSTALLER,
  LOADER_INSTALLERS,
  PLUGIN_HELPER,
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
import { argumentsOf, brief, calleeName, isProvableRawPlugin } from "./chain.mjs";
import { planNextResult } from "./next-result.mjs";
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

/**
 * What a proven composition step installs — the IMPORTED name of its single
 * argument, whichever verb the step is spelled with.
 *
 * This is also how an already-migrated step is told from a pre-E one: an
 * argument that resolves to a Comvi installer is composition and is left alone,
 * while a `.use(x)` whose `x` is not one was the raw plugin queue.
 */
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

/**
 * A composition step that is a BARE `loader()` — the configured installer
 * called with no import map.
 *
 * The map is required in 0.5.0, so this call does not type-check any more; what
 * it meant is `attachLoader`, which is what it delegated to. Returns the
 * argument NODE to splice over, the local name `loader` was reached through,
 * and the SPECIFIER it came from — both names live on every entry that
 * publishes either, so the new import merges into that same clause.
 *
 * Resolves the import itself rather than trusting the caller, so the chain
 * walk and the residual `.with` sweep can share one answer.
 *
 * ONLY a zero-argument call is rewritten. `loader(...maps)` spreads to
 * something the text does not name — it may well be one map — so it comes back
 * marked `spread` and is reported: rewriting it would silently drop a
 * registration.
 */
function bareLoaderCallAt(root, call) {
  const argument = argumentsOf(call)[0];
  if (argument === undefined || argument.kind() !== "call_expression") return undefined;
  const local = calleeName(argument);
  if (local === undefined) return undefined;
  const binding = importedBinding(root, local);
  if (binding === undefined || binding.typeOnly) return undefined;
  if (binding.imported !== LOADER_INSTALLER || !binding.source.startsWith("@comvi/")) {
    return undefined;
  }
  const args = argumentsOf(argument);
  const found = { argument, local, source: binding.source };
  if (args.length === 0) return { ...found, spread: false };
  if (args.some((node) => node.kind() === "spread_element")) return { ...found, spread: true };
  return undefined;
}

/**
 * The name the removed ICU installer was imported under. It is deliberately NOT
 * in `capabilities.mjs`: that file is the LIVE 0.5.0 surface, and this is a name
 * only the detector below still has a use for.
 */
const REMOVED_ICU_INSTALLER = "icu";

/**
 * The LOCAL name a composition step uses for the removed `icu()` installer, or
 * `undefined` when the step is something else. Either verb: a 0.5-pre tree
 * spells the step `.with(icu())`, and the reader may have renamed it already.
 *
 * Resolved through the IMPORT rather than the call text, for the two reasons
 * every other provenance check here has: `import { icu as installIcu }` writes
 * `installIcu()` at the call site, and a reader's own local `icu()` helper is
 * not this API. Any `@comvi/*` source counts — core publishes it on the
 * `/icu` subpath while every wrapper re-exports it from its single entry, and
 * both spellings name the same removed function. The local name is what comes
 * back because it is what the reader has to go and find.
 */
function removedIcuInstallerAt(root, step) {
  const args = argumentsOf(step.call);
  if (args.length !== 1) return undefined;
  const argument = args[0];
  const name =
    calleeName(argument) ?? (argument.kind() === "identifier" ? argument.text() : undefined);
  if (name === undefined) return undefined;
  const binding = importedBinding(root, name);
  const removed =
    binding !== undefined &&
    !binding.typeOnly &&
    binding.imported === REMOVED_ICU_INSTALLER &&
    binding.source.startsWith("@comvi/");
  return removed ? name : undefined;
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
 * Core keeps one capability per pure subpath; every wrapper package re-exports
 * all of them from its single entry. A host imported from anywhere
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
// module specifiers
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
// `flattenCatalog` moved to the `@comvi/core` root
// ---------------------------------------------------------------------------

/** The quoted-string span of a declaration's `from "…"`, quotes excluded. */
function sourceSpanOf(declaration) {
  const node = declaration.field("source");
  if (node === null || node.kind() !== "string") return undefined;
  return { start: startOf(node) + 1, end: node.range().end.index - 1 };
}

/**
 * Plans the ONE thing a 0.4 `flattenCatalog` needs: a different module.
 *
 * The function itself did not change and neither did any call to it, so nothing
 * at a call site moves — this rule never reads one. What changed is publication:
 * `@comvi/core/loader` and the five binding roots that re-exported it dropped it
 * when the base host took over flattening, leaving the `@comvi/core` root. An
 * import the codemod left pointing at the old entry does not resolve, which is a
 * broken file rather than a migration.
 *
 * A clause that names it ALONE is retargeted in place, alias and all. One that
 * carries other names is SPLIT — `createI18n` still belongs to the binding it
 * came from — by dropping the specifier and placing it on `@comvi/core`: in the
 * clause an in-place retarget just produced, if there was one, and otherwise
 * through `planNamedImports`, which merges it into an existing `@comvi/core`
 * import or opens one.
 *
 * A `/slim` source is absorbed here rather than left to the specifier rule:
 * two edits to one string collide, and a retarget that needs a second run to
 * converge is not one. Hence `claimed`.
 *
 * Everything else that names it from a moved entry is REPORTED, because it is
 * already broken on 0.5.0 and silence would certify a tree that cannot build:
 * a namespace access, an `import()` / `require()` result, and a re-export whose
 * clause carries other names (splitting an `export … from` is the reader's
 * call — the names around it may be type-only re-exports).
 */
function planFlattenCatalogMove(root) {
  const target = CORE_SUBPATH_OF.get(FLATTEN_CATALOG);
  const edits = [];
  const manual = [];
  const needs = new Map();
  const claimed = new Set();
  let retargets = 0;

  const moved = (source) => source !== undefined && FLATTEN_CATALOG_MOVED_FROM.includes(source);

  // --- named imports --------------------------------------------------------
  const byDeclaration = new Map();
  for (const entry of namedImports(root)) {
    if (entry.imported !== FLATTEN_CATALOG || !moved(entry.source)) continue;
    byDeclaration.set(startOf(entry.declaration), entry);
  }
  const inPlace = [];
  const split = [];
  for (const entry of byDeclaration.values()) {
    const bindings = entry.declaration.find({ rule: { kind: "import_clause" } });
    const siblings = bindings === null ? [] : bindings.children().filter((kid) => kid.isNamed());
    const alone = braceListMembers(entry.clause).length === 1;
    const span = sourceSpanOf(entry.declaration);
    // A DEFAULT import shares the clause, so the declaration is not ours to
    // retarget even when `{ flattenCatalog }` is the only name in the braces.
    if (alone && siblings.length <= 1 && span !== undefined) inPlace.push({ entry, span });
    else split.push({ entry, alone, siblings });
  }

  for (const { entry, span } of inPlace) {
    edits.push({ ...span, text: target });
    claimed.add(startOf(entry.declaration));
    retargets += 1;
  }

  // A clause retargeted in place IS an `@comvi/core` import once the edits
  // land, so the split names merge into it instead of opening a second import
  // of the same module. A type-only one is not a host for a value name.
  const host = inPlace.find(({ entry }) => !entry.typeOnly)?.entry.clause;
  const merged = [];
  for (const { entry, alone, siblings } of split) {
    if (alone) {
      // Emptying the braces would leave `import def, {} from "…"`, so the
      // braces go with the comma in front of them.
      const before = siblings.filter((kid) => kid.range().end.index <= startOf(entry.clause)).pop();
      edits.push({
        start: before === undefined ? startOf(entry.clause) : before.range().end.index,
        end: entry.clause.range().end.index,
        text: "",
      });
    } else {
      edits.push(
        ...braceListRemoval(entry.clause, (member) => startOf(member) === startOf(entry.specifier)),
      );
    }
    // The specifier's own text carries the alias and any inline `type` keyword,
    // so the new import is the old one with a different module behind it.
    if (host === undefined) needs.set(entry.specifier.text(), target);
    else merged.push(entry.specifier.text());
    retargets += 1;
  }
  if (host !== undefined && merged.length > 0) edits.push(braceListInsertion(host, merged));

  // --- re-exports -----------------------------------------------------------
  for (const declaration of root.findAll({ rule: { kind: "export_statement" } })) {
    const source = moduleOf(declaration);
    if (!moved(source)) continue;
    const specifiers = declaration.findAll({ rule: { kind: "export_specifier" } });
    if (!specifiers.some((entry) => entry.field("name")?.text() === FLATTEN_CATALOG)) continue;
    const span = sourceSpanOf(declaration);
    if (specifiers.length === 1 && span !== undefined) {
      edits.push({ ...span, text: target });
      claimed.add(startOf(declaration));
      retargets += 1;
      continue;
    }
    manual.push({
      offset: startOf(declaration),
      shape: "flatten-catalog-moved",
      detail:
        `\`${FLATTEN_CATALOG}\` is re-exported from "${source}", which no longer publishes it ` +
        `— move it to its own \`export { ${FLATTEN_CATALOG} } from "${target}";\` by hand`,
    });
  }

  // --- namespace access -----------------------------------------------------
  const namespaces = new Map();
  for (const declaration of root.findAll({ rule: { kind: "import_statement" } })) {
    const source = moduleOf(declaration);
    if (!moved(source)) continue;
    const namespace = declaration.find({ rule: { kind: "namespace_import" } });
    const match =
      namespace === null ? undefined : /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(namespace.text());
    if (match !== undefined && match !== null) namespaces.set(match[1], source);
  }
  for (const access of root.findAll({ rule: { kind: "member_expression" } })) {
    const object = access.field("object");
    if (object?.kind() !== "identifier" || !namespaces.has(object.text())) continue;
    if (access.field("property")?.text() !== FLATTEN_CATALOG) continue;
    manual.push({
      offset: startOf(access),
      shape: "flatten-catalog-moved",
      detail:
        `\`${access.text()}\` reaches \`${FLATTEN_CATALOG}\` through a namespace import from ` +
        `"${namespaces.get(object.text())}", which no longer re-exports it — import it from ` +
        `"${target}" and re-run`,
    });
  }

  // --- an `import()` / `require()` result -----------------------------------
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    const loader = call.field("function")?.text();
    if (loader !== "import" && loader !== "require") continue;
    const specifier = argumentsOf(call)[0];
    if (specifier?.kind() !== "string") continue;
    const source = specifier.text().slice(1, -1);
    if (!moved(source)) continue;
    const reads = readsFlattenCatalogOff(call);
    if (reads === undefined) continue;
    manual.push({
      offset: startOf(reads),
      shape: "flatten-catalog-moved",
      detail:
        `\`${loader}("${source}")\` is read for \`${FLATTEN_CATALOG}\`, which that entry no ` +
        `longer re-exports — take it from "${target}" by hand`,
    });
  }

  return { edits, manual, needs, claimed, retargets };
}

/**
 * The node that takes `flattenCatalog` off a dynamic module record, if any —
 * the destructured name in `const { flattenCatalog } = await import(…)`, the
 * property read in `require(…).flattenCatalog`, or the one inside the callback
 * of `import(…).then((m) => m.flattenCatalog)`.
 *
 * Deliberately gated on the NAME: a dynamic import of a binding root is an
 * ordinary thing to do, and reporting every one of them would bury the finding
 * that matters under a manual item for every lazily-loaded route.
 */
function readsFlattenCatalogOff(call) {
  // The expression that CONSUMES the module record: the declarator it is
  // assigned from, or the member/call chain hanging off the import.
  let scope = call;
  for (const ancestor of call.ancestors()) {
    const kind = ancestor.kind();
    if (kind === "await_expression" || kind === "member_expression" || kind === "call_expression") {
      scope = ancestor;
      continue;
    }
    if (kind === "variable_declarator") scope = ancestor;
    break;
  }

  const bound = scope.find({
    rule: { kind: "shorthand_property_identifier_pattern", regex: `^${FLATTEN_CATALOG}$` },
  });
  if (bound !== null) return bound;
  return (
    scope
      .findAll({ rule: { kind: "member_expression" } })
      .find((access) => access.field("property")?.text() === FLATTEN_CATALOG) ??
    scope.findAll({ rule: { kind: "pair_pattern" } }).find((pair) => {
      const key = pair.field("key");
      return key !== null && keyText(key) === FLATTEN_CATALOG;
    })
  );
}

// ---------------------------------------------------------------------------
// the host-factory rename
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
// `.use` that never reaches a static chain
// ---------------------------------------------------------------------------

/**
 * `.use(…)` on a STORED host: `const i18n = createI18n(…); i18n.use(p)`, the
 * conditional `if (dev) i18n.use(p)`, and every loop or array around them.
 *
 * Before decision E this was always a report: `use` was the raw plugin queue,
 * the base host did not have it, and the fix was a change at CONSTRUCTION,
 * which is not where the call is. The queue is now called `registerPlugin`, and
 * that splits the shape in two along a line the text can actually decide:
 *
 *   • the construction PROVES the plugin host (it composes `plugins()`,
 *     `attachPlugins`, `${PLUGIN_HELPER}(…)` or a lowercase plugin installer),
 *     so the receiver has the queue under its new name and the call is a
 *     RENAME: `i18n.use(p)` -> `i18n.registerPlugin(p)`. Nothing moves, the
 *     argument is untouched, and evaluation order cannot change.
 *   • it does not, so the receiver's capability is still the open question and
 *     the recipe still belongs at the construction — reported, as before.
 *
 * Three guards keep both halves honest: only bindings the file itself assigns
 * from a host construction count (`app.use(router)` in a component is not this
 * shape); a `.use(installer)` — already the one composition verb — is neither
 * renamed nor reported; and, the guard this shape was missing, the ARGUMENT has
 * to be a provable raw plugin before the rename fires.
 *
 * That last one is the whole discriminator the chain path spells out at
 * `planChain`'s `raw-plugin-needs-helper` branch, and it belongs here for
 * exactly the reason stated there: `.use(x())` reads differently before and
 * after decision E. Skipping only what `installedBy` can PLACE renamed every
 * other argument, so `i18n.use(wrapMetrics())` — the reader's own installer,
 * from the reader's own module, already correct — became
 * `i18n.registerPlugin(wrapMetrics())`, which throws `E_PLUGIN_INIT_RETURN` at
 * `init()`. A migration must not break code that is already correct, so a
 * lowercase unprovable callee is taken at its word and left alone, with an
 * advisory that says what to do if the convention got it wrong.
 */
function detectStoredHostUse(root, hosts) {
  const findings = [];
  const edits = [];
  let renames = 0;

  for (const declarator of root.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name === null || value === null || name.kind() !== "identifier") continue;

    const construction = chainRootOf(value);
    const hostModule = hosts.get(constructedName(construction) ?? "");
    if (hostModule === undefined) continue;
    const composed = chainSteps(construction).some((step) =>
      PLUGIN_HOST_PROVIDERS.includes(installedBy(root, step, hostModule)),
    );

    const binding = name.text();
    for (const access of scopeOf(declarator).findAll({ rule: { kind: "member_expression" } })) {
      if (access.field("object")?.text() !== binding) continue;
      const property = access.field("property");
      if (property?.text() !== "use") continue;
      const call = access.parent();
      if (call?.kind() !== "call_expression") continue;
      // An installer in the slot is composition, not a queued plugin: the same
      // call is valid on any host, and renaming it would break it.
      if (installedBy(root, { call }, hostModule) !== undefined) continue;

      // The queue form is `use(plugin, options)`, so the plugin is the FIRST
      // argument whether or not options follow it.
      const args = argumentsOf(call);
      const argument = args.length > 0 && args[0].kind() !== "spread_element" ? args[0] : undefined;
      const local = calleeName(argument);

      if (!isProvableRawPlugin(argument)) {
        if (argument !== undefined && local !== undefined && !/^[A-Z]/.test(local)) {
          findings.push({
            offset: startOf(property),
            shape: "raw-plugin-needs-helper",
            detail:
              `\`${binding}.use(${brief(argument)})\` reads as an installer by its lowercase ` +
              `name and is left as written — if \`${local}()\` returns a PLUGIN rather than an ` +
              `installer, call \`${binding}.registerPlugin(${local}(…))\` on a host that ` +
              `composes \`.use(${PLUGIN_HOST_INSTALLER}())\`, or wrap it as ` +
              `\`${binding}.use(${PLUGIN_HELPER}(${local}(…)))\``,
          });
          continue;
        }
        findings.push({
          offset: startOf(access),
          shape: "stored-host-plugin-use",
          detail:
            `\`${binding}.use(${args[0] === undefined ? "…" : brief(args[0])})\` hands \`.use\` ` +
            `something the codemod cannot prove is an installer OR a plugin — a spread is N ` +
            `plugins in one call and a bare binding may hold a list, so neither the rename nor ` +
            `the \`${PLUGIN_HELPER}(…)\` wrap is safe here: write it out by hand, one call per ` +
            `plugin`,
        });
        continue;
      }

      if (composed) {
        edits.push({ ...spanOf(property), text: "registerPlugin" });
        renames += 1;
        continue;
      }
      findings.push({
        offset: startOf(access),
        shape: "stored-host-plugin-use",
        detail:
          `\`${binding}.use(…)\` runs a raw plugin on a stored \`${HOST_FACTORY}(…)\` result, ` +
          `and \`.use\` takes an INSTALLER — compose \`.use(${PLUGIN_HOST_INSTALLER}())\` (or a ` +
          `lowercase installer) where the host is constructed and call ` +
          `\`${binding}.registerPlugin(…)\` here, or wrap the plugin as ` +
          `\`${binding}.use(${PLUGIN_HELPER}(…))\``,
      });
    }
  }
  return { manual: findings, edits, renames };
}

// ---------------------------------------------------------------------------
// `.with` that never reaches a static chain
// ---------------------------------------------------------------------------

/**
 * The node a COMPOSITION chain starts from, or `undefined` when the expression
 * is not one.
 *
 * The difference from `chainRootOf` is the method test: every link between the
 * expression and its root must be `use` or `with`. `i18n.with(loader())` walks
 * down to `i18n`; `i18n.t("x")` does not walk at all, because `t` is not a
 * composition step and the value it produces is a string, not a host.
 */
function compositionRootOf(node) {
  let current = node;
  while (current.kind() === "call_expression") {
    const callee = current.field("function");
    if (callee === null) return undefined;
    if (callee.kind() !== "member_expression") return current;
    const method = callee.field("property")?.text();
    if (method !== "use" && method !== "with") return undefined;
    const object = callee.field("object");
    if (object === null) return undefined;
    current = object;
  }
  return current;
}

/**
 * Local bindings that PROVABLY hold a Comvi host, to a fixed point.
 *
 * Seeded from the constructions `hosts` vouches for, then grown through
 * composition: `const withLoader = i18n.with(loader())` holds whatever `i18n`
 * held, because that is what an installer returns. The fixed point is what
 * makes a two-step migration decidable — `withLoader.with(plugins())` is a host
 * call, and the only way to know is to have followed `i18n` through the first
 * step.
 */
function hostBindingNames(root, hosts) {
  const names = new Set();
  const declarators = root.findAll({ rule: { kind: "variable_declarator" } });
  for (;;) {
    let grew = false;
    for (const declarator of declarators) {
      const name = declarator.field("name");
      const value = declarator.field("value");
      if (name === null || value === null || name.kind() !== "identifier") continue;
      if (names.has(name.text())) continue;
      const origin = compositionRootOf(value);
      if (origin === undefined) continue;
      const proven =
        hosts.has(constructedName(origin) ?? "") ||
        (origin.kind() === "identifier" && names.has(origin.text()));
      if (!proven) continue;
      names.add(name.text());
      grew = true;
    }
    if (!grew) return names;
  }
}

/**
 * Did the retired verb ever take this argument?
 *
 * `.with(installer)` took exactly two shapes: a CALL — the installer factory,
 * `loader()`, `plugins()`, the reader's own `wrapMetrics()` — or a bare
 * `attach*` reference, the low-level installer used without calling it. Nothing
 * else was ever a composition step.
 *
 * This is what keeps the sweep below quiet on code that has nothing to do with
 * us. `with` is not a Comvi word: `date.with({ month: 2 })` is Temporal and
 * `locales.with(0, "en")` is `Array.prototype.with`, and an object, a number, a
 * string or a bare non-`attach` identifier in the slot says the receiver is
 * somebody else's API. Reporting those made every app that uses either feature
 * carry a manual item for a verb it never wrote. Same discriminator the
 * `banned/with-composition` lint rule uses, for the same reason.
 */
function withInstallerShaped(call) {
  const argument = argumentsOf(call)[0];
  if (argument === undefined) return false;
  if (argument.kind() === "call_expression") return true;
  return argument.kind() === "identifier" && /^attach/.test(argument.text());
}

/**
 * Every `.with(` the chain transform did not reach.
 *
 * `.with` is handled inside `chainSteps()`, which only walks the calls chained
 * DIRECTLY onto a `createI18n(…)`. A `.with` reached through a stored binding —
 * `const withLoader = i18n.with(loader())` — is not in any such chain, so it
 * survived, and the tool then printed "nothing to migrate, this tree is already
 * on the 0.5.0 surface" over a file that still calls a method 0.5.0 deleted.
 * That sentence is the failure: a certification nobody can act on is worse than
 * a rewrite nobody asked for.
 *
 * So every surviving `.with(` is accounted for, one of three ways:
 *
 *   • on a PROVABLE Comvi host it is RENAMED, as safely as it is in a chain —
 *     `with` exists on no 0.5.0 host, so `use` with the same argument in the
 *     same position is the only spelling that can run;
 *   • on an unprovable receiver where the argument is INSTALLER-SHAPED it is
 *     REPORTED. `getHost()` may well return a 0.5-pre host and the codemod
 *     cannot see through the call, so the rename is the reader's to make — but
 *     the tool can no longer call the tree clean without a human having looked;
 *   • on an unprovable receiver whose argument the retired verb never took, the
 *     codemod is SILENT. That `with` belongs to somebody else's API.
 */
function detectResidualWith(root, hosts, handled) {
  const findings = [];
  const edits = [];
  const needs = new Map();
  const prunable = new Set();
  const loaderRewrites = new Set();
  let renames = 0;
  let attachRewrites = 0;
  const bindings = hostBindingNames(root, hosts);

  for (const member of root.findAll({ rule: { kind: "member_expression" } })) {
    const property = member.field("property");
    const object = member.field("object");
    if (property === null || object === null || property.text() !== "with") continue;
    if (handled.has(startOf(property))) continue;
    const call = member.parent();
    if (call?.kind() !== "call_expression") continue;
    if (startOf(call.field("function")) !== startOf(member)) continue;

    // The removed ICU installer is refused here exactly as it is in a chain:
    // renaming the verb around a call that has to GO would leave a step that
    // still does not resolve.
    const removedIcu = removedIcuInstallerAt(root, { call });
    if (removedIcu !== undefined) {
      findings.push({
        offset: startOf(property),
        shape: "icu-installer-removed",
        detail:
          `\`.with(${removedIcu}(…))\` composes the removed \`${REMOVED_ICU_INSTALLER}()\` ` +
          `installer — ICU is a compiler setting, not a capability: drop the step and pass ` +
          `\`compiler: ${ICU_COMPILER}\` in the \`${HOST_FACTORY}(…)\` options, which serves ` +
          `inline, loader, CDN and API catalogs alike`,
      });
      continue;
    }

    const origin = compositionRootOf(call);
    const proven =
      origin !== undefined &&
      (hosts.has(constructedName(origin) ?? "") ||
        (origin.kind() === "identifier" && bindings.has(origin.text())));
    if (proven) {
      edits.push({ ...spanOf(property), text: "use" });
      renames += 1;
      // The step is on a proven host, so the bare-`loader()` rewrite is as
      // right here as it is inside a chain — and leaving it would rename the
      // verb around a call that no longer type-checks.
      const bare = bareLoaderCallAt(root, call);
      if (bare !== undefined && bare.spread) {
        findings.push({
          offset: startOf(property),
          shape: "loader-map-unproven",
          detail:
            `\`.with(${brief(bare.argument)})\` spreads its arguments, so the codemod cannot ` +
            `tell an import map from nothing — \`${LOADER_INSTALLER}(map)\` now REQUIRES the ` +
            `map: pass it, or write \`.use(${LOADER_ATTACH_INSTALLER})\` and ` +
            `\`registerLoader(fn)\` by hand`,
        });
      } else if (bare !== undefined) {
        // A binding the codemod cannot place is a REPORT, not a half-rewrite:
        // the emitted file has to still resolve.
        if (bindingState(root, LOADER_ATTACH_INSTALLER, bare.source) === "collision") {
          findings.push({
            offset: startOf(property),
            shape: "loader-map-unproven",
            detail:
              `\`.with(${bare.local}())\` composes the loader with no import map, which ` +
              `\`${LOADER_INSTALLER}(map)\` now REQUIRES — and ` +
              `\`${LOADER_ATTACH_INSTALLER}\` is already declared locally, so it cannot be ` +
              `imported here: write \`.use(${LOADER_ATTACH_INSTALLER})\` by hand`,
          });
        } else {
          edits.push({ ...spanOf(bare.argument), text: LOADER_ATTACH_INSTALLER });
          needs.set(LOADER_ATTACH_INSTALLER, bare.source);
          prunable.add(bare.local);
          loaderRewrites.add(startOf(bare.argument));
          attachRewrites += 1;
        }
      }
      continue;
    }
    // Unprovable receiver. Only an INSTALLER-SHAPED argument makes this
    // plausibly ours; anything else is a `with` the retired verb never had.
    if (!withInstallerShaped(call)) continue;
    findings.push({
      offset: startOf(property),
      shape: "residual-with-verb",
      detail:
        `\`${brief(member)}(…)\` calls \`with\` with an installer-shaped argument, and no 0.5.0 ` +
        `Comvi host has \`with\` — but this receiver cannot be proven to be one, so it is left ` +
        `exactly as written: rename it to \`.use(…)\` by hand if it IS a host`,
    });
  }
  return { manual: findings, edits, renames, needs, prunable, attachRewrites, loaderRewrites };
}

/**
 * Every bare `loader()` the rules above did NOT rewrite.
 *
 * The two rewrite paths reach a bare `loader()` only through a PROVEN host: a
 * static `createI18n(…)` chain, or a `.with` on a binding the sweep followed
 * to one. Everywhere else the call survives — a refused chain, an unprovable
 * receiver, an installer stored in a local — and in 0.5.0 it does not compile,
 * because `loader(map)` requires its map.
 *
 * Saying nothing about those is the failure this codemod exists to avoid: the
 * tool would print "already on the 0.5.0 surface" over a file that cannot
 * build. So each one is reported at its own offset, with the sentence the
 * decision collapses to.
 */
function detectUnrewrittenBareLoader(root, rewritten) {
  const findings = [];
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    if (rewritten.has(startOf(call))) continue;
    const callee = call.field("function");
    if (callee === null || callee.kind() !== "identifier") continue;
    if (argumentsOf(call).length > 0) continue;
    const binding = importedBinding(root, callee.text());
    if (binding === undefined || binding.typeOnly) continue;
    if (binding.imported !== LOADER_INSTALLER || !binding.source.startsWith("@comvi/")) continue;
    findings.push({
      offset: startOf(call),
      shape: "loader-map-unproven",
      detail:
        `\`${callee.text()}()\` composes the loader with no import map, and ` +
        `\`${LOADER_INSTALLER}(map)\` REQUIRES it in 0.5.0 — an import map goes to ` +
        `\`.use(${LOADER_INSTALLER}(map))\`, a loader FUNCTION goes to ` +
        `\`.use(${LOADER_ATTACH_INSTALLER})\` followed by \`registerLoader(fn)\`; this call ` +
        `site is not in a chain the codemod can prove, so it is left as written`,
    });
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
  const loaderRewrites = new Set();
  const count = (kind, amount = 1) => transforms.set(kind, (transforms.get(kind) ?? 0) + amount);

  const rename = planHostRename(root);
  edits.push(...rename.edits);
  manual.push(...rename.manual, ...detectDynamicSlimSpecifiers(root));
  if (rename.renames > 0) count("slim-factory-rename", rename.renames);

  // Planned BEFORE the /slim rewrite below, which is why it returns `claimed`:
  // a `flattenCatalog` import off `@comvi/react/slim` has one right answer
  // (`@comvi/core`), and two rules editing that one string would collide.
  const flatten = planFlattenCatalogMove(root);
  edits.push(...flatten.edits);
  manual.push(...flatten.manual);
  for (const [specifier, module] of flatten.needs) needs.set(specifier, module);
  if (flatten.retargets > 0) count("flatten-catalog-source", flatten.retargets);

  for (const specifier of moduleSpecifiers(root)) {
    if (flatten.claimed.has(startOf(specifier.declaration))) continue;
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
  // A host name the module ALSO declares locally — a parameter, a local
  // `const`, a catch binding — is not this API at the shadowed call site, and
  // the text does not say which sites the shadow covers. So the name is
  // refused for the whole module (the same bound `planHostRename` uses) and
  // every construction through it is reported at its own line.
  const shadowedHosts = new Map();
  for (const name of [...hosts.keys()]) {
    const shadow = localDeclarations(root, name)[0];
    if (shadow === undefined) continue;
    shadowedHosts.set(name, shadow);
    hosts.delete(name);
  }
  const storedUse = detectStoredHostUse(root, hosts);
  manual.push(...storedUse.manual);
  edits.push(...storedUse.edits);
  if (storedUse.renames > 0) count("register-plugin-rename", storedUse.renames);

  const constructions = [
    ...root.findAll({ rule: { kind: "call_expression" } }),
    ...root.findAll({ rule: { kind: "new_expression" } }),
  ];
  const withInChains = new Set();
  for (const call of constructions) {
    const hostName = constructedName(call) ?? "";
    if (shadowedHosts.has(hostName)) {
      manual.push({
        offset: startOf(call),
        shape: "shadowed-host-binding",
        detail:
          `\`${hostName}\` is imported from a Comvi host entry AND declared locally in this ` +
          `module, so this construction may not be the imported one — it is left untouched; ` +
          `rename the local binding and re-run`,
      });
      continue;
    }
    const hostModule = hosts.get(hostName);
    if (hostModule === undefined) continue;

    // Every `.with` step of a proven chain is accounted for by `planChain`,
    // whether it rewrites it or refuses the chain whole, so the residual sweep
    // below must not see it twice — and must not rewrite a step inside a chain
    // that came back byte-identical on purpose.
    for (const step of chainSteps(call)) {
      if (step.method === "with") withInChains.add(startOf(step.property));
    }

    const chain = planChain(root, text, call, hostModule);
    manual.push(...chain.manual);
    if (chain.blocked) continue;
    edits.push(...chain.edits);
    for (const [kind, amount] of chain.transforms) count(kind, amount);
    for (const [name, module] of chain.needs) needs.set(name, module);
    for (const name of chain.prunable) prunable.add(name);
    for (const offset of chain.loaderRewrites) loaderRewrites.add(offset);
  }

  const residual = detectResidualWith(root, hosts, withInChains);
  manual.push(...residual.manual);
  edits.push(...residual.edits);
  for (const [name, module] of residual.needs) needs.set(name, module);
  for (const name of residual.prunable) prunable.add(name);
  for (const offset of residual.loaderRewrites) loaderRewrites.add(offset);
  if (residual.renames > 0) count("use-verb-rename", residual.renames);
  if (residual.attachRewrites > 0) count("loader-attach-only", residual.attachRewrites);

  // The `createNextI18n(…)` result is its own receiver family (`@comvi/next`
  // is not a host module above): planned here so its imports land in the ONE
  // import plan below.
  const nextResult = planNextResult(root);
  manual.push(...nextResult.manual);
  edits.push(...nextResult.edits);
  for (const [kind, amount] of nextResult.transforms) count(kind, amount);
  for (const [name, module] of nextResult.needs) needs.set(name, module);
  for (const name of nextResult.prunable) prunable.add(name);

  manual.push(...detectUnrewrittenBareLoader(root, loaderRewrites));

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
  // Bare-`loader()` arguments this chain rewrote, by offset. The file-level
  // sweep at the end of `planSingleEntry` reports the ones NOTHING reached.
  const loaderRewrites = new Set();
  const count = (kind, amount = 1) => transforms.set(kind, (transforms.get(kind) ?? 0) + amount);
  const refuse = () => ({ blocked: true, manual: blockers, edits: [] });

  const steps = chainSteps(call);
  const options = argumentsOf(call)[0];

  // --- the chain: what does it already compose, and where? ------------------
  let devtoolsStep;
  let loaderStep;

  for (const step of steps) {
    // The removed installer is checked FIRST and refuses the chain: it is the
    // one step whose presence means the text was written against a surface
    // that never shipped, and rewriting the rest around it would leave a
    // chain that still does not resolve.
    const removedIcu = removedIcuInstallerAt(root, step);
    if (removedIcu !== undefined) {
      blockers.push({
        offset: startOf(step.property),
        shape: "icu-installer-removed",
        detail:
          `\`.${step.method}(${removedIcu}(…))\` composes the removed ` +
          `\`${REMOVED_ICU_INSTALLER}()\` installer — ICU is a compiler setting, not a ` +
          `capability: drop the step and pass \`compiler: ${ICU_COMPILER}\` in the ` +
          `\`${HOST_FACTORY}(…)\` options, which serves inline, loader, CDN and API catalogs alike`,
      });
      continue;
    }

    // A step whose argument is a proven Comvi installer is COMPOSITION, under
    // whichever verb it is written. Only the verb may need fixing.
    const composed = installedBy(root, step, hostModule);
    if (composed !== undefined) {
      if (DEVTOOLS_PROVIDERS.includes(composed)) devtoolsStep = step;
      if (LOADER_INSTALLERS.includes(composed) && loaderStep === undefined) loaderStep = step;

      // The import map is REQUIRED in 0.5.0, so a bare `loader()` is the one
      // composition step that still needs its ARGUMENT changed and not just
      // its verb: `attachLoader`, the attach-only installer it delegated to.
      const bare = bareLoaderCallAt(root, step.call);
      if (bare !== undefined && bare.spread) {
        advisories.push({
          offset: startOf(step.property),
          shape: "loader-map-unproven",
          detail:
            `\`.${step.method}(${brief(bare.argument)})\` spreads its arguments, so the codemod ` +
            `cannot tell an import map from nothing — \`${LOADER_INSTALLER}(map)\` now REQUIRES ` +
            `the map: pass it, or write \`.use(${LOADER_ATTACH_INSTALLER})\` and ` +
            `\`registerLoader(fn)\` by hand`,
        });
      } else if (bare !== undefined) {
        edits.push({ ...spanOf(bare.argument), text: LOADER_ATTACH_INSTALLER });
        needs.set(LOADER_ATTACH_INSTALLER, bare.source);
        prunable.add(bare.local);
        loaderRewrites.add(startOf(bare.argument));
        count("loader-attach-only");
      }

      if (step.method === "with") {
        edits.push({ ...spanOf(step.property), text: "use" });
        count("use-verb-rename");
      }
      continue;
    }

    // Not an installer. Under `with` that is simply a step the codemod cannot
    // vouch for — the reader's own installer, or a foreign one — and the verb
    // rename is still right: `with` does not exist on any 0.5.0 host, so the
    // only spelling that can work is `use`, with the same argument.
    if (step.method === "with") {
      edits.push({ ...spanOf(step.property), text: "use" });
      count("use-verb-rename");
      continue;
    }

    // Under `use` it is a RAW PLUGIN: that slot was the plugin queue in every
    // surface before decision E, and after it the slot takes an installer.
    const args = argumentsOf(step.call);
    const argument = args.length === 1 && args[0].kind() !== "spread_element" ? args[0] : undefined;
    const local = calleeName(argument);

    const installer = local === undefined ? undefined : PLUGIN_INSTALLERS.get(local);
    if (installer !== undefined) {
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
            `\`${local}\` is not a value import from "${expectedModule}" under its own name, so ` +
            `it cannot be proven to be the first-party factory — write ` +
            `\`.use(${installer}(…))\` by hand`,
        });
        continue;
      }
      // The verb already reads correctly; only the callee moves, so the
      // options, the position and the evaluation order are all preserved.
      edits.push({ ...spanOf(argument.field("function")), text: installer });
      needs.set(installer, binding.source);
      prunable.add(local);
      count("plugin-installer");
      if (LOADER_INSTALLERS.includes(installer) && loaderStep === undefined) loaderStep = step;
      continue;
    }

    // Any other plugin goes through the helper, which attaches the capability
    // itself — so nothing has to be inserted in front of it and the step keeps
    // its exact position. The wrap is a splice around the argument's own text:
    // one expression, evaluated once, in the same order as before.
    //
    // WHICH arguments, though, is the one judgement call in this file, because
    // `.use(x())` reads differently before and after decision E: it was the raw
    // plugin queue, and it is now the installer pipe. The discriminator is the
    // published naming convention, the same one `PLUGIN_INSTALLERS` above
    // encodes — `FetchLoader()` is a plugin, `fetchLoader()` is its installer:
    //
    //   • an Uppercase callee, or an INLINE function, is a raw plugin and is
    //     wrapped;
    //   • a lowercase callee the codemod cannot place is taken at its word as
    //     an installer and LEFT ALONE, with an advisory. Wrapping it would
    //     corrupt every hand-written `.use(myOwnInstaller())` on the second run
    //     — a migration must not break code that is already correct — and
    //     silence would hide the one case the convention gets wrong;
    //   • anything else is refused. A SPREAD is N plugins in one call and
    //     cannot become one wrap, and a bare binding or an element read may
    //     hold an array or a list, which `${PLUGIN_HELPER}` would accept as a
    //     single plugin without complaint.
    const inlinePlugin =
      argument !== undefined &&
      (argument.kind() === "arrow_function" || argument.kind() === "function_expression");
    if (argument !== undefined && local !== undefined && !/^[A-Z]/.test(local)) {
      advisories.push({
        offset: startOf(step.property),
        shape: "raw-plugin-needs-helper",
        detail:
          `\`.use(${brief(argument)})\` reads as an installer by its lowercase name and is left ` +
          `as written — if \`${local}()\` returns a PLUGIN rather than an installer, wrap it as ` +
          `\`.use(${PLUGIN_HELPER}(${local}(…)))\``,
      });
      continue;
    }
    if (argument === undefined || (local === undefined && !inlinePlugin)) {
      blockers.push({
        offset: startOf(step.property),
        shape: "raw-plugin-needs-helper",
        detail:
          `\`.use(${argument === undefined ? (args[0] === undefined ? "…" : brief(args[0])) : brief(argument)})\` ` +
          `hands \`.use\` something that is not an installer — wrap each plugin as ` +
          `\`.use(${PLUGIN_HELPER}(plugin))\` by hand, one call per plugin`,
      });
      continue;
    }

    edits.push({ ...spanOf(argument), text: `${PLUGIN_HELPER}(${argument.text()})` });
    needs.set(PLUGIN_HELPER, bindingModule(hostModule, PLUGIN_HELPER));
    count("raw-plugin-helper");
  }

  if (blockers.length > 0) return refuse();

  // There is no ordering rule to enforce here. ICU used to be a composed step
  // that had to reach the host before the first catalog, and that is exactly
  // what the constructor option replaced: a compiler named in the options is
  // decided before anything is ingested, from any source.

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
        `\`${DEVTOOLS_OPTIONS.join("` / `")}\` and ICU comma syntax`,
    });
    return refuse();
  }
  if (options !== undefined && !inline) {
    advisories.push({
      offset: startOf(call),
      shape: "opaque-host-options",
      detail:
        `\`${HOST_FACTORY}(${brief(options)})\` options are not an inline object — check them by ` +
        `hand for \`${DEVTOOLS_OPTIONS.join("` / `")}\` and ICU comma syntax`,
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
          "ICU comma syntax",
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
          "for ICU comma syntax",
      });
      return refuse();
    }

    // A catalog assembled elsewhere is the SAME blind spot as opaque options,
    // and it is the common one: `translation: en` from a JSON module is exactly
    // the shape that silently loses ICU. Nesting is NOT part of that blind spot
    // any more — the host flattens whatever shape this turns out to be — so the
    // advisory asks about ICU and nothing else.
    if (translation !== undefined && catalogs === undefined) {
      advisories.push({
        offset: startOf(translation.member),
        shape: "opaque-host-options",
        detail:
          `\`${translation.member.text().split(/\s*:/)[0]}\` is not an inline catalog — check it ` +
          `by hand for ICU comma syntax`,
      });
    }

    if (catalogs !== undefined && !properties.some(({ key }) => key === "compiler")) {
      if (firstIcuArgument(catalogs) !== undefined) {
        edits.push(braceListInsertion(options, [`compiler: ${ICU_COMPILER}`], isMoved));
        needs.set(ICU_COMPILER, bindingModule(hostModule, ICU_COMPILER));
        compilerAdded = true;
        count("inline-icu-compiler");
      } else {
        // No ICU was PROVEN, which is not the same as no ICU: a locale whose
        // value lives elsewhere — `{ en }` shorthand, a binding, a call — is
        // `translation: en` written inside the braces, and it earns the same
        // advisory for the same reason. Only when nothing proved ICU: a
        // `compiler` the rewrite just added already serves the halves it
        // could not read.
        for (const locale of objectProperties(catalogs)) {
          if (isReadableCatalog(locale.value)) continue;
          advisories.push({
            offset: startOf(locale.member),
            shape: "opaque-host-options",
            detail:
              `\`${locale.member.field("key")?.text() ?? locale.member.text()}\` is not an ` +
              `inline catalog — check it by hand for ICU comma syntax`,
          });
        }
      }
    }

    // A NESTED catalog is deliberately not looked at. It used to be wrapped in
    // `flattenCatalog(…)`, because flattening was an optional capability hook
    // and a base host stored `{ nav: { home } }` as if it were already flat.
    // The base host now flattens at the one seam a catalog enters, so nesting
    // is not a migration: the wrap would be pure noise, and so would an
    // advisory telling the reader to go and look at something that works.
  }

  // --- the two options that became `devtools()` arguments -------------------
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
      text: `${gap}.use(${DEVTOOLS_INSTALLER}({ ${carried} }))`,
    });
    needs.set(DEVTOOLS_INSTALLER, bindingModule(hostModule, DEVTOOLS_INSTALLER));
    count("devtools-options");
  }

  // --- the catalogs the codemod cannot read --------------------------------
  const compilerProven =
    compilerAdded || (properties?.some(({ key }) => key === "compiler") ?? false);
  if (loaderStep !== undefined && inline && !compilerProven) {
    advisories.push({
      offset: startOf(loaderStep.property),
      shape: "runtime-icu-unproven",
      detail:
        `this host loads catalogs at runtime and keeps the default compiler — if any loaded ` +
        `catalog uses ICU syntax, pass \`compiler: ${ICU_COMPILER}\` in the ` +
        `\`${HOST_FACTORY}(…)\` options (the codemod cannot read remote catalogs)`,
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
          `\`${name}\` is already declared locally — THIS \`${HOST_FACTORY}(…)\` chain is left ` +
          `untouched (every chain is planned on its own, so the others in this file may well be ` +
          `migrated)`,
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

  return { blocked: false, edits, manual: advisories, transforms, needs, prunable, loaderRewrites };
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

/**
 * The first ICU argument type in the VALUES of a fully static inline catalog.
 *
 * A property with NO value node is the shorthand `{ en }`, which is legal
 * wherever an object literal is — so it is the first thing checked. Reading
 * `.kind()` off it threw, which made `createI18n({ locale, translation: { en } })`
 * crash the whole tool instead of migrating the file.
 */
function firstIcuArgument(catalogs) {
  const visit = (value) => {
    if (value === undefined || value === null) return undefined;
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

/**
 * Can the ICU scan above READ this catalog value to the leaves — literals, or
 * nested objects of them?
 *
 * This is the other half of the answer `firstIcuArgument` gives: "no ICU found"
 * and "no ICU provable" look identical from its return value, and they are not
 * the same fact. A shorthand `{ en }`, a binding, a call or an element read puts
 * the leaves somewhere the codemod cannot follow.
 *
 * NOT the same question as `firstOpaqueMember`, which asks whether the object's
 * own SHAPE is decidable and refuses the chain when it is not. Here the shape is
 * plain; only the text of the messages is missing.
 */
function isReadableCatalog(value) {
  if (value === undefined || value === null) return false;
  const kind = value.kind();
  if (kind === "string") return true;
  if (kind === "template_string") {
    return value.find({ rule: { kind: "template_substitution" } }) === null;
  }
  if (kind !== "object") return false;
  // Spreads and computed keys never get this far: both refuse the chain above,
  // so `objectProperties` skipping them cannot hide a leaf from this walk.
  return objectProperties(value).every(({ value: leaf }) => isReadableCatalog(leaf));
}
