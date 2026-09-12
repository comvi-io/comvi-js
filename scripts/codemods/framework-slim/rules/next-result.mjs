/**
 * The `createNextI18n(…)` result — decision D7 for Next (0.5.0, wave 2, N1).
 *
 * | 9  | `.use(Plugin(), { runtime, environment, … })`   | `.use(nextPlugin(Plugin(), { … }))`               |
 * | 10 | `.use(load, { lazy: true, … })`                  | `.use(nextPluginLazy(load, { … }))`               |
 * | 11 | `.useClient(p, o)` / `.useServer(p, o)`          | `.use(nextPlugin(p, { …o, runtime: "…" }))`       |
 * | 12 | `.useClientLazy(l, o)` / `.useServerLazy(l, o)`  | `.use(nextPluginLazy(l, { …o, runtime: "…" }))`   |
 * | 13 | `.use(RawPlugin())`, no options                  | `.use(nextPlugin(RawPlugin()))`                   |
 * | 3  | `.use(FetchLoader(o))`, no options               | `.use(fetchLoader(o))` — row 3, same table        |
 *
 * Before N1 `result.use(plugin, options)` was Next's own SCOPED raw-plugin
 * queue — one word, zero letters apart from the SDK's composition verb, with
 * the opposite timing. After it, `result.use(installer)` IS that verb, and
 * scoping moved onto the PLUGIN form: `nextPlugin(plugin, { runtime,
 * environment, …pluginOptions })` and `nextPluginLazy(load, { … })`, both from
 * `@comvi/next`. So every queue-shaped step becomes `.use(<installer>(…))`,
 * the four scoped delegates are deleted (not deprecated) and become the same
 * two installers with the runtime baked in, and `lazy: true` — a boolean that
 * changed the meaning of argument 1 — becomes the choice of installer.
 *
 * The same two invariants `single-entry.mjs` states hold here: THE CHAIN IS
 * THE UNIT (one undecidable step refuses the whole chain, reported), and EVERY
 * EDIT IS A SPLICE — the plugin expression, the options members and their
 * formatting are the author's own text, moved by offset, never re-printed.
 *
 * The receiver is resolved through the IMPORT of `createNextI18n` from
 * `@comvi/next` (alias followed), and a STORED result — `const nextI18n =
 * createNextI18n(…)` and every binding composed from it — is a receiver too,
 * because that is the shape the 0.4 README taught.
 */
import {
  PLUGIN_FACTORY_MODULES,
  PLUGIN_INSTALLERS,
  NEXT_ROOT,
  NEXT_PLUGIN_INSTALLER,
  NEXT_PLUGIN_LAZY_INSTALLER,
  NEXT_RESULT_FACTORY,
} from "./capabilities.mjs";
import { argumentsOf, brief, calleeName, isProvableRawPlugin } from "./chain.mjs";
import { bindingState, importedBinding, localDeclarations, namedImports } from "./imports.mjs";
import { braceListInsertion, braceListMembers, braceListRemoval } from "./script-blocks.mjs";

const spanOf = (node) => ({ start: node.range().start.index, end: node.range().end.index });
const startOf = (node) => node.range().start.index;
const endOf = (node) => node.range().end.index;

/** The deleted delegates, and the runtime + installer each one baked in. */
const DELEGATES = new Map([
  ["useClient", { runtime: "client", lazy: false }],
  ["useServer", { runtime: "server", lazy: false }],
  ["useClientLazy", { runtime: "client", lazy: true }],
  ["useServerLazy", { runtime: "server", lazy: true }],
]);

const STEP_METHODS = new Set(["use", ...DELEGATES.keys()]);

/** Local names bound to `createNextI18n` from `@comvi/next`. */
function resultFactories(root) {
  const names = new Set();
  for (const entry of namedImports(root)) {
    if (entry.imported === NEXT_RESULT_FACTORY && !entry.typeOnly && entry.source === NEXT_ROOT) {
      names.add(entry.local);
    }
  }
  return names;
}

/**
 * The `.use` / delegate calls chained DIRECTLY onto `call`, in evaluation
 * order — the Next twin of `chainSteps`, with the four delegates admitted.
 */
function resultSteps(call) {
  const steps = [];
  let node = call;
  for (;;) {
    const member = node.parent();
    if (member === null || member.kind() !== "member_expression") break;
    const object = member.field("object");
    const property = member.field("property");
    if (object === null || property === null) break;
    if (startOf(object) !== startOf(node)) break;
    if (!STEP_METHODS.has(property.text())) break;
    const outer = member.parent();
    if (outer === null || outer.kind() !== "call_expression") break;
    if (startOf(outer.field("function")) !== startOf(member)) break;
    steps.push({ method: property.text(), property, call: outer });
    node = outer;
  }
  return steps;
}

/** The node a result chain starts from: `createNextI18n(…)` or a binding. */
function chainOrigin(node) {
  let current = node;
  while (current.kind() === "call_expression") {
    const callee = current.field("function");
    if (callee === null) return undefined;
    if (callee.kind() !== "member_expression") return current;
    if (!STEP_METHODS.has(callee.field("property")?.text())) return undefined;
    const object = callee.field("object");
    if (object === null) return undefined;
    current = object;
  }
  return current;
}

/**
 * Bindings that PROVABLY hold the result, to a fixed point: seeded from
 * `createNextI18n(…)` constructions and grown through chains, because every
 * step returns the same result.
 */
function resultBindings(root, factories) {
  const names = new Set();
  const declarators = root.findAll({ rule: { kind: "variable_declarator" } });
  for (;;) {
    let grew = false;
    for (const declarator of declarators) {
      const name = declarator.field("name");
      const value = declarator.field("value");
      if (name === null || value === null || name.kind() !== "identifier") continue;
      if (names.has(name.text())) continue;
      const origin = chainOrigin(value);
      if (origin === undefined) continue;
      const proven =
        factories.has(calleeName(origin) ?? "") ||
        (origin.kind() === "identifier" && names.has(origin.text()));
      if (!proven) continue;
      names.add(name.text());
      grew = true;
    }
    if (!grew) return names;
  }
}

/**
 * Is this `.use` argument an INSTALLER the codemod can vouch for — a call to
 * (or a bare reference of) a lowercase binding imported from a `@comvi/*`
 * module? That is composition, already on the 0.5 surface, and is left alone.
 */
function isKnownInstaller(root, argument) {
  const name =
    calleeName(argument) ?? (argument.kind() === "identifier" ? argument.text() : undefined);
  if (name === undefined || /^[A-Z]/.test(name)) return false;
  const binding = importedBinding(root, name);
  return binding !== undefined && !binding.typeOnly && binding.source.startsWith("@comvi/");
}

const keyOf = (member) => {
  if (member.kind() === "pair") {
    const key = member.field("key");
    if (key === null || key.kind() === "computed_property_name") return undefined;
    return key.kind() === "string" ? key.text().slice(1, -1) : key.text();
  }
  if (member.kind() === "shorthand_property_identifier") return member.text();
  return undefined;
};

/**
 * Plans one result chain. `blocked` means the chain comes back byte-identical
 * and `manual` says why.
 */
function planResultChain(root, steps) {
  const edits = [];
  const blockers = [];
  const advisories = [];
  const transforms = new Map();
  const needs = new Map();
  const prunable = new Set();
  const count = (kind) => transforms.set(kind, (transforms.get(kind) ?? 0) + 1);

  const require = (installer, module, at) => {
    const state = bindingState(root, installer, module);
    if (state === "collision") {
      blockers.push({
        offset: at,
        shape: "local-name-collision",
        detail: `\`${installer}\` is already bound in this module to something other than the "${module}" export, so the migrated chain cannot import it — rename the local binding and re-run`,
      });
      return false;
    }
    if (state === "absent") needs.set(installer, module);
    return true;
  };

  // Wrap the whole argument list of `step.call` in `installer(…)`: the two
  // parentheses are the only characters added, so every argument keeps its
  // text, its position and its formatting. `before` is text that belongs
  // INSIDE the wrap, right after the last argument — an options object a
  // delegate call never had — and it travels in the same edit as the closing
  // parenthesis, because two insertions at one offset have no defined order.
  const wrap = (step, installer, before = "") => {
    const args = step.call.field("arguments");
    const last = argumentsOf(step.call).at(-1);
    edits.push({ start: startOf(args) + 1, end: startOf(args) + 1, text: `${installer}(` });
    const closeAt = before === "" ? endOf(args) - 1 : endOf(last);
    edits.push({ start: closeAt, end: closeAt, text: `${before})` });
  };

  for (const step of steps) {
    const args = argumentsOf(step.call);
    const delegate = DELEGATES.get(step.method);
    const at = startOf(step.property);
    const spelled = `.${step.method}(${args.map(brief).join(", ")})`;

    if (args.length === 0 || args.length > 2 || args.some((a) => a.kind() === "spread_element")) {
      blockers.push({
        offset: at,
        shape: "next-plugin-unproven",
        detail: `\`${spelled}\` is not the one-plugin, one-options shape the scoped queue took — write \`.use(${NEXT_PLUGIN_INSTALLER}(plugin, { … }))\` by hand, one call per plugin`,
      });
      continue;
    }
    const [plugin, options] = args;

    // --- the deleted delegates: runtime baked into the installer ------------
    if (delegate !== undefined) {
      const installer = delegate.lazy ? NEXT_PLUGIN_LAZY_INSTALLER : NEXT_PLUGIN_INSTALLER;
      const runtimeMember = `runtime: "${delegate.runtime}"`;
      let appended = "";
      if (options === undefined) {
        appended = `, { ${runtimeMember} }`;
      } else if (options.kind() === "object") {
        const clash = braceListMembers(options).find((member) =>
          ["runtime", "lazy"].includes(keyOf(member) ?? ""),
        );
        if (clash !== undefined) {
          blockers.push({
            offset: startOf(clash),
            shape: "next-plugin-unproven",
            detail: `\`${spelled}\` passes \`${keyOf(clash)}\` to a delegate that fixed it — decide which wins and write \`.use(${installer}(…, { … }))\` by hand`,
          });
          continue;
        }
        // Appended, as the delegate spread it: `{ ...options, runtime }`.
        edits.push(braceListInsertion(options, [runtimeMember]));
      } else {
        // An opaque options value keeps the delegate's exact spread semantics.
        edits.push({ ...spanOf(options), text: `{ ...${options.text()}, ${runtimeMember} }` });
      }
      if (!require(installer, NEXT_ROOT, at)) continue;
      edits.push({ ...spanOf(step.property), text: "use" });
      wrap(step, installer, appended);
      count("next-delegate-rename");
      continue;
    }

    // --- `.use(plugin, options)`: the scoped queue -----------------------------
    if (options !== undefined) {
      if (options.kind() !== "object") {
        blockers.push({
          offset: at,
          shape: "next-plugin-unproven",
          detail: `\`${spelled}\` passes options the codemod cannot read, and \`lazy\` in them decides whether the first argument is a plugin or a loader — write \`.use(${NEXT_PLUGIN_INSTALLER}(…))\` or \`.use(${NEXT_PLUGIN_LAZY_INSTALLER}(…))\` by hand`,
        });
        continue;
      }
      const members = braceListMembers(options);
      const opaque = members.find((member) => keyOf(member) === undefined);
      if (opaque !== undefined) {
        blockers.push({
          offset: startOf(opaque),
          shape: "next-plugin-unproven",
          detail: `\`${spelled}\` has a spread or computed member in its options, which may carry \`lazy\` — write the installer by hand`,
        });
        continue;
      }
      const lazyMember = members.find((member) => keyOf(member) === "lazy");
      let lazy = false;
      if (lazyMember !== undefined) {
        const value = lazyMember.kind() === "pair" ? lazyMember.field("value")?.text() : undefined;
        if (value !== "true" && value !== "false") {
          blockers.push({
            offset: startOf(lazyMember),
            shape: "next-plugin-unproven",
            detail: `\`${spelled}\` decides \`lazy\` at runtime, and the 0.5 surface decides it by installer — write \`.use(${NEXT_PLUGIN_INSTALLER}(…))\` or \`.use(${NEXT_PLUGIN_LAZY_INSTALLER}(…))\` by hand`,
          });
          continue;
        }
        lazy = value === "true";
      }
      const installer = lazy ? NEXT_PLUGIN_LAZY_INSTALLER : NEXT_PLUGIN_INSTALLER;
      if (!require(installer, NEXT_ROOT, at)) continue;
      if (lazyMember !== undefined) {
        if (members.length === 1) {
          // `lazy` was the only option: the object goes with it.
          edits.push({ start: endOf(plugin), end: endOf(options), text: "" });
        } else {
          edits.push(
            ...braceListRemoval(options, (member) => startOf(member) === startOf(lazyMember)),
          );
        }
      }
      wrap(step, installer);
      count(lazy ? "next-plugin-lazy" : "next-plugin-scope");
      continue;
    }

    // --- `.use(x)`: composition after N1, the unscoped queue before it --------
    if (isKnownInstaller(root, plugin)) continue;

    const local = calleeName(plugin);
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
          offset: at,
          shape: "ambiguous-plugin-factory",
          detail: `\`${local}\` is not a value import from "${expectedModule}" under its own name, so it cannot be proven to be the first-party factory — write \`.use(${installer}(…))\` by hand`,
        });
        continue;
      }
      if (!require(installer, binding.source, at)) continue;
      edits.push({ ...spanOf(plugin.field("function")), text: installer });
      prunable.add(local);
      count("plugin-installer");
      continue;
    }

    if (isProvableRawPlugin(plugin)) {
      if (!require(NEXT_PLUGIN_INSTALLER, NEXT_ROOT, at)) continue;
      wrap(step, NEXT_PLUGIN_INSTALLER);
      count("next-plugin-scope");
      continue;
    }

    if (local !== undefined && !/^[A-Z]/.test(local)) {
      advisories.push({
        offset: at,
        shape: "raw-plugin-needs-helper",
        detail: `\`.use(${brief(plugin)})\` reads as an installer by its lowercase name and is left as written — if \`${local}()\` returns a PLUGIN rather than an installer, wrap it as \`.use(${NEXT_PLUGIN_INSTALLER}(${local}(…)))\``,
      });
      continue;
    }

    blockers.push({
      offset: at,
      shape: "raw-plugin-needs-helper",
      detail: `\`.use(${brief(plugin)})\` hands \`.use\` something the codemod cannot prove is an installer OR a plugin — wrap each plugin as \`.use(${NEXT_PLUGIN_INSTALLER}(plugin))\` by hand`,
    });
  }

  if (blockers.length > 0) {
    return {
      blocked: true,
      manual: [...blockers, ...advisories],
      edits: [],
      transforms,
      needs,
      prunable,
    };
  }
  return { blocked: false, manual: advisories, edits, transforms, needs, prunable };
}

/**
 * Plans every `createNextI18n(…)` result chain in the file, chained or stored.
 *
 * @returns {{ edits: Array<{start:number,end:number,text:string}>,
 *             manual: Array<{offset:number,shape:string,detail:string}>,
 *             transforms: Map<string, number>, needs: Map<string, string>,
 *             prunable: string[] }}
 */
export function planNextResult(root) {
  const edits = [];
  const manual = [];
  const transforms = new Map();
  const needs = new Map();
  const prunable = new Set();

  const factories = resultFactories(root);
  if (factories.size === 0) return { edits, manual, transforms, needs, prunable: [] };

  // A factory name the module also declares locally is not this API at the
  // shadowed site, and the text does not say which sites: refused module-wide.
  for (const name of [...factories]) {
    const shadow = localDeclarations(root, name)[0];
    if (shadow === undefined) continue;
    manual.push({
      offset: startOf(shadow),
      shape: "shadowed-host-binding",
      detail: `\`${name}\` is imported from "${NEXT_ROOT}" AND declared locally in this module, so its result chains may not be the imported one — they are left untouched; rename the local binding and re-run`,
    });
    factories.delete(name);
  }

  const bindings = resultBindings(root, factories);
  for (const name of [...bindings]) {
    if (localDeclarations(root, name).length <= 1) continue;
    manual.push({
      offset: startOf(localDeclarations(root, name)[1]),
      shape: "shadowed-host-binding",
      detail: `\`${name}\` holds a \`${NEXT_RESULT_FACTORY}(…)\` result AND is declared again in this module — every \`${name}.use\` here is left untouched; rename the second binding and re-run`,
    });
    bindings.delete(name);
  }

  const chains = [];
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    if (!factories.has(calleeName(call) ?? "")) continue;
    chains.push(resultSteps(call));
  }
  // The steps off a stored binding: `nextI18n.useClient(…)` and any chain that
  // hangs off it, each statement its own chain.
  for (const member of root.findAll({ rule: { kind: "member_expression" } })) {
    const object = member.field("object");
    const property = member.field("property");
    if (object?.kind() !== "identifier" || !bindings.has(object.text())) continue;
    if (property === null || !STEP_METHODS.has(property.text())) continue;
    const call = member.parent();
    if (call?.kind() !== "call_expression" || startOf(call.field("function")) !== startOf(member)) {
      continue;
    }
    chains.push([{ method: property.text(), property, call }, ...resultSteps(call)]);
  }

  for (const steps of chains) {
    if (steps.length === 0) continue;
    const plan = planResultChain(root, steps);
    manual.push(...plan.manual);
    if (plan.blocked) continue;
    edits.push(...plan.edits);
    for (const [kind, amount] of plan.transforms) {
      transforms.set(kind, (transforms.get(kind) ?? 0) + amount);
    }
    for (const [name, module] of plan.needs) needs.set(name, module);
    for (const name of plan.prunable) prunable.add(name);
  }

  return { edits, manual, transforms, needs, prunable: [...prunable] };
}
