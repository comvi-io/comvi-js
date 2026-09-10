/**
 * T1–T5 — the destructure transform.
 *
 * | T1 | pure loader destructure            | hook -> `useI18nLoader()`, `ns` dropped |
 * | T2 | pure plugins destructure           | hook -> `useI18nPlugins()`              |
 * | T3 | mixed common + capability          | SPLIT; `ns` preserved on `useI18n`      |
 * | T4 | aliased bindings                   | alias carried through T1–T3             |
 * | T5 | repeated destructures per BLOCK    | one capability call per block           |
 *
 * The T3/T5 MERGE is also the idempotence mechanism: a second run finds no
 * capability member left on any `useI18n()` destructure, so it plans no edits
 * at all and the file comes back byte-identical.
 *
 * The merge unit is the enclosing BLOCK, never the enclosing function: a
 * `const` declared inside an `if` is not visible after it, so merging across
 * blocks would hoist a binding out of the block that declared it and every
 * later reference would be a ReferenceError.
 *
 * Everything this module cannot rewrite CORRECTLY it refuses to touch and
 * reports — silent skips are prohibited.
 */
import { HOOKS, HOOK_NAMES, MEMBER_TO_HOOK, SOURCE_HOOK } from "./capabilities.mjs";
import { braceListInsertion } from "./script-blocks.mjs";
import { blockId } from "./scope.mjs";

const DECLARATION_KINDS = ["lexical_declaration", "variable_declaration"];

/** The declaration keyword, read from the text rather than guessed at. */
const DECLARATION_KEYWORD = /^(const|let|var)\b/;

/** A quoted static key names the same member as the bare one. */
const keyText = (key) => (key.kind() === "string" ? key.text().slice(1, -1) : key.text());

/** Static key kinds a destructured member name can be read from. */
const STATIC_KEY_KINDS = new Set(["property_identifier", "string", "number"]);

function isHookCall(value, hookName) {
  if (value === null || value.kind() !== "call_expression") return false;
  const callee = value.field("function");
  return callee !== null && callee.kind() === "identifier" && callee.text() === hookName;
}

/**
 * Reads one object pattern into entries.
 * @returns {{ entries: Array<{member: string, text: string}>, blocker: string | undefined }}
 */
function readPattern(pattern) {
  const entries = [];
  for (const child of pattern.children()) {
    const kind = child.kind();
    if (kind === "comment") {
      // A SPLIT re-prints the statement, and no rule can say which half a
      // comment between two members belongs to. Refuse rather than drop it.
      return {
        entries,
        blocker: `comment \`${child.text().replace(/\s+/g, " ")}\` between the members`,
        always: false,
      };
    }
    if (!child.isNamed()) continue;
    if (kind === "shorthand_property_identifier_pattern") {
      entries.push({ member: child.text(), text: child.text() });
      continue;
    }
    if (kind === "rest_pattern") {
      return {
        entries,
        blocker: `rest spread \`${child.text()}\` — the moved members would silently leave it`,
        always: true,
      };
    }
    if (kind === "pair_pattern") {
      const key = child.field("key");
      if (key === null || key.kind() === "computed_property_name") {
        return {
          entries,
          blocker: `computed key \`${child.text()}\` — the target hook is undecidable`,
          always: true,
        };
      }
      if (!STATIC_KEY_KINDS.has(key.kind())) {
        return {
          entries,
          blocker: `key \`${key.text()}\` (${key.kind()}) is not a static member name`,
          always: true,
        };
      }
      // `{ "reloadTranslations": reload }` names the same member as the bare
      // key, so it migrates the same way — the emitted TEXT stays verbatim.
      entries.push({ member: keyText(key), text: child.text() });
      continue;
    }
    if (kind === "object_assignment_pattern") {
      // `{ t = fallback }` — a default on a member that stays is fine, but a
      // default on a moved member changes evaluation order. Refuse both.
      return {
        entries,
        blocker: `default value \`${child.text()}\` in the destructure`,
        always: false,
      };
    }
    return {
      entries,
      blocker: `unsupported destructure element \`${child.text()}\` (${kind})`,
      always: false,
    };
  }
  return { entries, blocker: undefined, always: false };
}

/** Line start offset of `index`, or -1 when non-whitespace precedes it on the line. */
function ownLineStart(text, index) {
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] !== "\n") {
    if (text[cursor] !== " " && text[cursor] !== "\t") return -1;
    cursor -= 1;
  }
  return cursor + 1;
}

/** End offset of the line `index` sits on, including its newline. */
function lineEnd(text, index) {
  const newline = text.indexOf("\n", index);
  return newline === -1 ? text.length : newline + 1;
}

/**
 * Plans every T1–T5 edit for one parsed source.
 *
 * @returns {{ edits: Array<{start:number,end:number,text:string}>,
 *             manual: Array<{offset:number,shape:string,detail:string}>,
 *             rewrites: number,
 *             hooksUsed: string[] }}
 */
export function planDestructures(root, text, sourceHook = SOURCE_HOOK) {
  const edits = [];
  const manual = [];
  const hooksUsed = new Set();

  const declarations = root.findAll({ rule: { any: DECLARATION_KINDS.map((kind) => ({ kind })) } });

  // --- pre-existing capability destructures, grouped by block + hook --------
  const existing = new Map(); // `${blockId}:${hook}` -> { node, pattern, members:Set }
  for (const declaration of declarations) {
    const declarators = declaration.children().filter((c) => c.kind() === "variable_declarator");
    if (declarators.length !== 1) continue;
    const [declarator] = declarators;
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name === null || name.kind() !== "object_pattern") continue;
    for (const hook of HOOK_NAMES) {
      if (!isHookCall(value, hook)) continue;
      const { entries, blocker } = readPattern(name);
      if (blocker !== undefined) continue; // left alone; reported only if we need it
      const key = `${blockId(declaration)}:${hook}`;
      if (existing.has(key)) continue; // first one in the block wins as the merge target
      existing.set(key, {
        pattern: name,
        members: new Set(entries.map((entry) => entry.member)),
      });
    }
  }

  // --- collect the moves, grouped by block + hook ---------------------------
  const moves = new Map(); // `${blockId}:${hook}` -> { entries: [], firstOwner: declarationNode }
  const owners = []; // per rewritten `useI18n()` declaration

  for (const declaration of declarations) {
    const declarators = declaration.children().filter((c) => c.kind() === "variable_declarator");
    const usesSourceHook = declarators.some((d) => isHookCall(d.field("value"), sourceHook));
    if (!usesSourceHook) continue;

    if (declarators.length !== 1) {
      manual.push({
        offset: declaration.range().start.index,
        shape: "unsupported-declaration",
        detail: `\`${sourceHook}()\` in a multi-declarator declaration — split it by hand first`,
      });
      continue;
    }

    const [declarator] = declarators;
    const pattern = declarator.field("name");
    const call = declarator.field("value");
    if (pattern === null || pattern.kind() !== "object_pattern") continue; // stored result: reported elsewhere

    const { entries, blocker, always } = readPattern(pattern);
    const capabilityNames = entries.filter((entry) => MEMBER_TO_HOOK.has(entry.member));
    if (blocker !== undefined) {
      // A blocker is reported when it always hides a migration (rest spread,
      // computed key) or when the destructure names a capability member the
      // transform then cannot move.
      const mentionsCapability = [...MEMBER_TO_HOOK.keys()].some((member) =>
        pattern.text().includes(member),
      );
      if (always === true || mentionsCapability) {
        manual.push({
          offset: declaration.range().start.index,
          shape: "unsupported-destructure",
          detail: `${blocker} in a \`${sourceHook}()\` destructure`,
        });
      }
      continue;
    }
    if (capabilityNames.length === 0) continue;

    // An explicit annotation describes the WHOLE destructured shape, and a
    // split has two shapes. Copying it onto both halves would type-check the
    // wrong thing, so the annotated destructure is a manual action.
    const annotation = declarator.field("type");
    if (annotation !== null) {
      manual.push({
        offset: declaration.range().start.index,
        shape: "unsupported-destructure",
        detail:
          `type annotation \`${annotation.text().replace(/\s+/g, " ").trim()}\` on a ` +
          `\`${sourceHook}()\` destructure — the split cannot divide it, so split it by hand`,
      });
      continue;
    }

    // Read the keyword from the front of the declaration. Scanning for the
    // first whitespace instead loses to `const{t}=useI18n()`, which has none.
    const keywordMatch = DECLARATION_KEYWORD.exec(declaration.text());
    if (keywordMatch === null) {
      manual.push({
        offset: declaration.range().start.index,
        shape: "unsupported-declaration",
        detail: `\`${sourceHook}()\` in a declaration with no \`const\`/\`let\`/\`var\` keyword — migrate it by hand`,
      });
      continue;
    }
    const keyword = keywordMatch[1];

    // An exported declaration never shares a bucket: `export` covers only the
    // FIRST statement the split emits, so the halves have to be emitted
    // together where the `export ` keyword can be repeated onto them.
    const exported = declaration.parent()?.kind() === "export_statement";
    const scope = exported ? `export@${declaration.range().start.index}` : blockId(declaration);
    const kept = entries.filter((entry) => !MEMBER_TO_HOOK.has(entry.member));
    const perHook = new Map();
    for (const entry of capabilityNames) {
      const hook = MEMBER_TO_HOOK.get(entry.member);
      const key = `${scope}:${hook}`;
      if (!moves.has(key)) moves.set(key, { hook, entries: [], firstOwnerIndex: owners.length });
      const bucket = moves.get(key);
      if (!bucket.entries.some((existingEntry) => existingEntry.member === entry.member)) {
        bucket.entries.push(entry);
      }
      perHook.set(hook, key);
      hooksUsed.add(hook);
    }

    owners.push({
      declaration,
      declarator,
      call,
      kept,
      keyword,
      exported,
      keys: [...perHook.values()],
    });
  }

  if (owners.length === 0) return { edits, manual, rewrites: 0, hooksUsed: [] };

  // --- turn the plan into text splices --------------------------------------
  const emitAt = new Map(); // owner index -> [hook statements]
  for (const [key, bucket] of moves) {
    const target = existing.get(key);
    if (target !== undefined) {
      const additions = bucket.entries.filter((entry) => !target.members.has(entry.member));
      if (additions.length === 0) continue;
      for (const entry of additions) target.members.add(entry.member);
      edits.push(
        braceListInsertion(
          target.pattern,
          additions.map((entry) => entry.text),
        ),
      );
      continue;
    }
    const list = emitAt.get(bucket.firstOwnerIndex) ?? [];
    list.push(bucket);
    emitAt.set(bucket.firstOwnerIndex, list);
  }

  const hookOrder = new Map(HOOKS.map(({ hook }, index) => [hook, index]));

  owners.forEach((owner, index) => {
    const { declaration, declarator, call, kept, keyword, exported } = owner;
    const start = declaration.range().start.index;
    const emitted = (emitAt.get(index) ?? [])
      .sort((a, b) => hookOrder.get(a.hook) - hookOrder.get(b.hook))
      .map(
        (bucket) =>
          `${keyword} { ${bucket.entries.map((e) => e.text).join(", ")} } = ${bucket.hook}();`,
      );

    const statements = [];
    if (kept.length > 0) {
      const args = call.field("arguments");
      const typeArguments = call.field("type_arguments");
      statements.push(
        `${keyword} { ${kept.map((entry) => entry.text).join(", ")} } = ${sourceHook}${
          typeArguments === null ? "" : typeArguments.text()
        }${args === null ? "()" : args.text()};`,
      );
    }
    statements.push(...emitted);

    // `export` sits in front of the replaced range and so covers only the
    // first emitted statement; every later half has to carry its own.
    if (exported) {
      for (let i = 1; i < statements.length; i += 1) statements[i] = `export ${statements[i]}`;
    }

    // The indent is the run of whitespace in front of the STATEMENT, which for
    // an exported declaration starts at the `export` keyword, not the `const`.
    const indentFrom = exported ? declaration.parent().range().start.index : start;
    const lineStart = ownLineStart(text, indentFrom);
    const indent = lineStart === -1 ? "" : text.slice(lineStart, indentFrom);

    if (statements.length === 0) {
      // Every binding moved into a destructure that already existed: drop the
      // now-empty statement, whole line and all.
      if (lineStart !== -1) {
        edits.push({
          start: lineStart,
          end: lineEnd(text, declaration.range().end.index),
          text: "",
        });
      } else {
        edits.push({ start, end: declaration.range().end.index, text: "" });
      }
      return;
    }
    // The file's own line ending: a T3/T5 split that emitted LF into a CRLF
    // source would leave one mixed line behind on every migrated component.
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    edits.push({
      start,
      end: declaration.range().end.index,
      text: statements.join(`${eol}${indent}`),
    });
    void declarator;
  });

  return { edits, manual, rewrites: owners.length, hooksUsed: [...hooksUsed] };
}
