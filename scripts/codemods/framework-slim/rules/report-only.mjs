/**
 * Report-only shapes — deterministic manual-action detection.
 *
 * Nothing here ever rewrites. Each detector answers one question a codemod
 * cannot answer from the text alone, and its findings force exit code 2 so a
 * partial migration can never be mistaken for a clean one.
 */
import {
  DROPPED_VUE_PROXIES,
  HOOK_NAMES,
  MEMBER_TO_HOOK,
  SOURCE_HOOK,
  VUE_PROXY_TARGET,
} from "./capabilities.mjs";
import { localDeclarations } from "./imports.mjs";
import { braceListMembers } from "./script-blocks.mjs";
import { scopeOf } from "./scope.mjs";

/**
 * Does this call hand its receiver a RAW PLUGIN — a FIRST argument that is a
 * call to an Uppercase factory?
 *
 * The uppercase name is the whole test, and it is the convention the packages
 * themselves follow: `FetchLoader()` is a plugin, `fetchLoader()` is its
 * installer. Anything else in the slot (an installer call, a bare binding, a
 * Vue plugin object) is left alone, because `.use` legitimately takes an
 * installer now.
 *
 * The FIRST argument, and only it, because that is the only position a plugin
 * can occupy: both `use(plugin, options)` and `.use(installer)` take their
 * subject first. Scanning every argument reported
 * `i18n.use(myInstaller(), { scope: Thing() })` — a correct 0.5 composition
 * whose SECOND argument happens to build something with a capitalised name.
 */
function hasRawPluginArgument(call) {
  const args = call.field("arguments");
  if (args === null) return false;
  const first = braceListMembers(args)[0];
  if (first === undefined || first.kind() !== "call_expression") return false;
  const callee = first.field("function");
  return callee?.kind() === "identifier" && /^[A-Z]/.test(callee.text());
}

/** Bindings that would shadow the hooks this codemod introduces. */
export function detectHookNameCollisions(root) {
  const findings = [];
  for (const hook of HOOK_NAMES) {
    for (const node of localDeclarations(root, hook)) {
      findings.push({
        offset: node.range().start.index,
        shape: "local-name-collision",
        detail: `\`${hook}\` is already declared locally — the destructures here are left alone`,
      });
    }
  }
  return findings;
}

/**
 * `useI18n()` results that never reach a destructure the transform supports:
 * read straight off the call, or stored in a binding a capability member is
 * later taken from — including from a nested function, which is the
 * "hook result crosses a function boundary" shape.
 *
 * Reported ONLY when a capability member is ACTUALLY read. `renderHook(() =>
 * useI18n())` and `const i = useI18n(); i.t(...)` need no migration, and a
 * report that lists them is a report nobody reads.
 */
export function detectEscapedHookResults(root, sourceHook = SOURCE_HOOK) {
  const findings = [];
  const capabilityMembers = [...MEMBER_TO_HOOK.keys()];

  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    const callee = call.field("function");
    if (callee === null || callee.kind() !== "identifier" || callee.text() !== sourceHook) continue;

    const parent = call.parent();
    if (parent === null) continue;

    if (parent.kind() === "member_expression") {
      const property = parent.field("property");
      if (property !== null && capabilityMembers.includes(property.text())) {
        findings.push({
          offset: parent.range().start.index,
          shape: "property-access-on-hook-result",
          detail: `\`${sourceHook}().${property.text()}\` — read it from \`${MEMBER_TO_HOOK.get(property.text())}()\` instead`,
        });
      }
      continue;
    }

    if (parent.kind() === "variable_declarator") {
      const name = parent.field("name");
      if (name === null || name.kind() !== "identifier") continue;
      const binding = name.text();
      // Resolve reads inside the DECLARING function only: two functions that
      // both name a local `bag` must not contaminate each other's findings.
      const reads = scopeOf(parent).findAll({ rule: { kind: "member_expression" } });
      const used = capabilityMembers.filter((member) =>
        reads.some(
          (access) =>
            access.field("object")?.text() === binding &&
            access.field("property")?.text() === member,
        ),
      );
      if (used.length === 0) continue;

      const declaringScope = scopeOf(parent);
      const crosses = reads.some(
        (access) =>
          access.field("object")?.text() === binding &&
          capabilityMembers.includes(access.field("property")?.text() ?? "") &&
          scopeOf(access).range().start.index !== declaringScope.range().start.index,
      );
      findings.push({
        offset: parent.range().start.index,
        shape: crosses ? "hook-result-crosses-boundary" : "stored-hook-result",
        detail: `\`${binding}\` holds the \`${sourceHook}()\` result and ${used
          .map((member) => `\`.${member}\``)
          .join(
            ", ",
          )} is read off it${crosses ? " from a nested function" : ""} — move those reads to ${[
          ...new Set(used.map((member) => `\`${MEMBER_TO_HOOK.get(member)}()\``)),
        ].join(" / ")}`,
      });
    }
  }
  return findings;
}

/**
 * Candidate call sites of the eight `VueI18n` proxies dropped in 0.5.0.
 *
 * The receiver's type is textually undecidable — `i18n.reloadTranslations()`
 * may be a `VueI18n` (migrate to `i18n.core.*`) or a raw core instance
 * (already correct) — so these are listed for a human, never rewritten. Only
 * `.vue` sources are scanned: elsewhere the same shape is overwhelmingly a
 * core instance and reporting it would be pure noise. The receiver set covers
 * nuxt `comvi.setup` hooks too. The report hedges with "if the receiver is a
 * VueI18n" because that is exactly what the text cannot settle.
 *
 * `use` is the one proxy whose ARGUMENT decides it, and after decision E it has
 * to: the wrapper's `use` is the composition verb now, so
 * `i18n.use(localeDetector())` and Vue's own `app.use(i18n)` are both correct
 * and neither is this finding. Only an Uppercase factory call — the way every
 * package spells a raw plugin — is reported, and its target member is
 * `registerPlugin`, not `use`.
 */
export function detectVueProxyCalls(root) {
  const findings = [];
  for (const access of root.findAll({ rule: { kind: "member_expression" } })) {
    const property = access.field("property");
    const object = access.field("object");
    if (property === null || object === null) continue;
    if (!DROPPED_VUE_PROXIES.includes(property.text())) continue;
    if (object.kind() === "member_expression" && object.field("property")?.text() === "core")
      continue;
    const call = access.parent();
    if (call?.kind() !== "call_expression") continue;
    if (property.text() === "use" && !hasRawPluginArgument(call)) continue;
    const target = VUE_PROXY_TARGET.get(property.text()) ?? property.text();
    findings.push({
      offset: access.range().start.index,
      shape: "vue-instance-proxy-call",
      detail: `\`${access.text()}(...)\` — if the receiver is a VueI18n it must become \`${object.text()}.core.${target}(...)\``,
    });
  }
  return findings;
}
