/**
 * Chain-reading helpers shared by the two composition-chain rule families —
 * the core hosts in `single-entry.mjs` and the `createNextI18n(…)` result in
 * `next-result.mjs`. Nothing here decides anything; each is one question about
 * one node, answered from the text alone.
 */
import { braceListMembers } from "./script-blocks.mjs";

/** One line of a node's text, for a report a human reads. */
export function brief(node) {
  const flat = node.text().replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/** The argument expressions of a call, comments and punctuation excluded. */
export function argumentsOf(call) {
  const args = call.field("arguments");
  return args === null ? [] : braceListMembers(args);
}

/** The name a call invokes, when that is a plain identifier. */
export function calleeName(node) {
  if (node === undefined || node === null || node.kind() !== "call_expression") return undefined;
  const callee = node.field("function");
  return callee !== null && callee.kind() === "identifier" ? callee.text() : undefined;
}

/**
 * Is this argument a PROVABLE raw plugin — something that cannot be an
 * installer?
 *
 * Four shapes, and they are the same four the chain path decides on
 * (`planChain` in single-entry.mjs, the `raw-plugin-needs-helper` branch):
 *
 *   • an Uppercase factory call, `FetchLoader()`, the published convention;
 *   • `new Uppercase()`, the class spelling of the same thing;
 *   • a member expression ending in an Uppercase call, `pkg.MyPlugin()`, which
 *     is that convention reached through a namespace;
 *   • an INLINE function or arrow, which needs no convention at all: an
 *     installer widens the host and returns it, so a literal function in the
 *     slot cannot be one.
 *
 * Everything else — a lowercase callee, a bare binding, an element read, a
 * spread — is NOT provable, and the two callers treat it as such.
 */
export function isProvableRawPlugin(argument) {
  if (argument === undefined) return false;
  const kind = argument.kind();
  if (kind === "arrow_function" || kind === "function_expression") return true;
  if (kind === "new_expression") {
    const constructor = argument.field("constructor");
    if (constructor === null) return false;
    const name =
      constructor.kind() === "member_expression"
        ? constructor.field("property")?.text()
        : constructor.text();
    return name !== undefined && /^[A-Z]/.test(name);
  }
  if (kind !== "call_expression") return false;
  const callee = argument.field("function");
  if (callee === null) return false;
  if (callee.kind() === "identifier") return /^[A-Z]/.test(callee.text());
  if (callee.kind() !== "member_expression") return false;
  const property = callee.field("property");
  return property !== null && /^[A-Z]/.test(property.text());
}
