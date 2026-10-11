// Property/fuzz harness for the message grammar behind `t()` — shared by the
// core dev suite, the core prod suite and the `<T>` parity suite in a binding.
//
// No dependency: a seeded PRNG, a generator and a shrinker are ~200 lines, and
// a property-testing library would be one more thing in the lockfile for them.
//
// DETERMINISTIC by default, so CI runs the same cases every time and a red run
// is reproducible from its own output:
//
//   COMVI_FUZZ_SEED=<n>   another seed (default below)
//   COMVI_FUZZ_RUNS=<n>   cases PER PROPERTY (default 300; try 20000 locally)
//
// A failure prints the seed, the case number and the MINIMAL failing message
// as a JS string literal — paste it into a named regression test.
import { createContext, Script } from "node:vm";

const DEFAULT_SEED = 20261011;
const DEFAULT_RUNS = 300;

/** One case may take this long before it counts as a hang. */
const CASE_TIMEOUT_MS = 2000;
/** A shrink step re-runs the property; a hang must not cost the full budget each time. */
const SHRINK_TIMEOUT_MS = 100;
/** Shrinking is a convenience: past this it reports the smallest message found so far. */
const SHRINK_BUDGET_MS = 3000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

export const FUZZ_SEED = envInt("COMVI_FUZZ_SEED", DEFAULT_SEED);
export const FUZZ_RUNS = envInt("COMVI_FUZZ_RUNS", DEFAULT_RUNS);

/**
 * Test timeout for one property. A synchronous test that overruns vitest's
 * default is reported as "timed out" INSTEAD of with its own error, which
 * would swallow the seed and the minimal message — so the budget scales with
 * the run count and leaves room for one hang plus its shrink.
 */
export const FUZZ_TIMEOUT_MS = 20_000 + FUZZ_RUNS * 10;

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** mulberry32: 32 bits of state, good enough distribution, identical on every platform. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    chance: (p) => next() < p,
  };
}

// ── Alphabet ────────────────────────────────────────────────────────────────

const SYNTAX = ["{", "}", "'", "#", "<", ">", "/", ",", "=", "&", "\\", "''"];

const WHITESPACE = [" ", " ", "\n", "\t", "\u0001", "\u001f", " ", " ", "﻿"];

const UNICODE = [
  "😀", // surrogate pair
  "👨‍👩‍👧‍👦", // ZWJ sequence
  "👍🏽", // skin-tone modifier
  "🇺🇦", // regional-indicator pair
  "\ud83d", // lone high surrogate
  "\ude00", // lone low surrogate
  "é", // base + combining mark
  "́", // combining mark with no base
  "שלום", // RTL
  "مرحبا", // RTL
  "‏", // RLM
  "‮", // RLO
];

const KEYWORDS = ["plural", "select", "selectordinal", "other", "one", "few", "many", "=0", "=1"];

const WORDS = ["a", "x", "Hi", "items", "name", "count", "b", "br", "link", "0", "42"];

const FRAGMENTS = [
  "{name}",
  "{ name }",
  "{count}",
  "{count, plural,",
  "{count, selectordinal,",
  "{gender, select,",
  " other {",
  " one {#",
  "<b>",
  "</b>",
  "<br/>",
  "<link>",
  "</link>",
  "&lt;",
  "&gt;",
  "&amp;",
  "\\<",
  "'{",
  "'}",
  "'#'",
];

const NOISE = [
  ...SYNTAX,
  ...SYNTAX,
  ...WHITESPACE,
  ...UNICODE,
  ...KEYWORDS,
  ...WORDS,
  ...FRAGMENTS,
];

/** Text that holds no `{`, so no argument can open in it. */
const TEXT = [...WORDS, ...WORDS, ...UNICODE, ...WHITESPACE, "'", "#", ">", "/", ",", "=", "}"];

/**
 * Text a GRAMMATICAL message may hold anywhere, a sub-message included: no
 * `}` to end a branch early, no `<` or `&` to open tag syntax, and an
 * apostrophe only where the next character is a letter — one in front of a
 * brace or a `#` would start a quoted section.
 */
const SAFE_TEXT = [...WORDS, ...UNICODE, ...WHITESPACE, "don't", "#", ">", "/", ",", "="];

/** Parameter names the generator writes; the suites bind every one of them. */
export const PARAM_NAMES = ["name", "count", "gender", "n"] as const;

const TAG_NAMES = ["b", "link", "br", "i"];

// ── Generators ──────────────────────────────────────────────────────────────

function sequence(rng: Rng, atoms: readonly string[], maxAtoms: number): string {
  let out = "";
  const length = 1 + rng.int(maxAtoms);
  for (let i = 0; i < length; i++) out += rng.pick(atoms);
  return out;
}

/** Uniform noise over the whole alphabet. */
function noise(rng: Rng): string {
  return sequence(rng, NOISE, 24);
}

/** A message with no `{` in it, so no argument can open. */
export function plainText(rng: Rng): string {
  return sequence(rng, TEXT, 12);
}

/** One or two atoms repeated: unclosed groups, deep nesting, long runs. */
function repetition(rng: Rng): string {
  const unit = rng.pick(NOISE) + (rng.chance(0.4) ? rng.pick(NOISE) : "");
  const tail = rng.chance(0.5) ? rng.pick(NOISE) : "";
  return unit.repeat(1 + rng.int(40)) + tail.repeat(1 + rng.int(40));
}

/** Optional ASCII whitespace: legal around an argument's name, type and selectors. */
function pad(rng: Rng): string {
  return rng.chance(0.75) ? "" : rng.pick([" ", "  ", "\n", "\t"]);
}

function branches(rng: Rng, depth: number, selectors: readonly string[]): string {
  let out = "";
  const count = 1 + rng.int(3);
  for (let i = 0; i < count; i++) {
    out += ` ${rng.pick(selectors)}${pad(rng)}{${wellFormed(rng, depth + 1)}}`;
  }
  // `other` is what ICU requires; leaving it out now and then is a shape too.
  if (rng.chance(0.85)) out += ` other {${wellFormed(rng, depth + 1)}}`;
  return out;
}

const PLURAL_SELECTORS = ["=0", "=1", "=2", "zero", "one", "two", "few", "many"];
const SELECT_SELECTORS = ["male", "female", "x", "😀", "other"];

function part(rng: Rng, depth: number): string {
  const nested = depth < 3;
  switch (rng.int(nested ? 10 : 5)) {
    case 0:
    case 1:
      return sequence(rng, SAFE_TEXT, 4);
    case 2:
      return `{${pad(rng)}${rng.pick(PARAM_NAMES)}${pad(rng)}}`;
    case 3:
      // No `'#'`: outside a plural its second apostrophe is an ordinary one,
      // and in front of a `}` that opens a quoted section — real ICU, but not
      // a message that stays grammatical wherever it lands.
      return rng.pick(["''", "'{'", "'}'", "'{name}'", "&lt;", "&amp;", "\\<", "#"]);
    case 4:
      return `<${rng.pick(TAG_NAMES)}/>`;
    case 5:
    case 6:
      return `{${pad(rng)}${rng.pick(["count", "n"])}${pad(rng)},${pad(rng)}${rng.pick(["plural", "selectordinal"])}${pad(rng)},${branches(rng, depth, PLURAL_SELECTORS)}${pad(rng)}}`;
    case 7:
      return `{${pad(rng)}gender${pad(rng)},${pad(rng)}select${pad(rng)},${branches(rng, depth, SELECT_SELECTORS)}${pad(rng)}}`;
    default: {
      const tag = rng.pick(TAG_NAMES);
      return `<${tag}>${wellFormed(rng, depth + 1)}</${tag}>`;
    }
  }
}

/**
 * A grammatical message — ICU arguments, quoting, tags and entities, nested up
 * to three levels. Uniform noise almost never balances a plural inside a tag
 * inside a select, so this is what reaches the parser's deep paths.
 */
export function wellFormed(rng: Rng, depth = 0): string {
  let out = "";
  const parts = 1 + rng.int(depth === 0 ? 5 : 3);
  for (let i = 0; i < parts; i++) out += part(rng, depth);
  return out;
}

/** A grammatical message with one to three small edits: the shapes a typo makes. */
function almostWellFormed(rng: Rng): string {
  let chars = Array.from(wellFormed(rng));
  const edits = 1 + rng.int(3);
  for (let i = 0; i < edits && chars.length > 0; i++) {
    const at = rng.int(chars.length);
    switch (rng.int(5)) {
      case 0:
        chars.splice(at, 1);
        break;
      case 1:
        chars.splice(at, 0, rng.pick(NOISE));
        break;
      case 2:
        chars = chars.slice(0, at);
        break;
      case 3: {
        const other = rng.int(chars.length);
        [chars[at], chars[other]] = [chars[other], chars[at]];
        break;
      }
      default:
        chars.splice(at, 0, ...chars.slice(at, at + 1 + rng.int(8)));
    }
  }
  return chars.join("");
}

/** The mix every "any message" property draws from. */
export function anyMessage(rng: Rng): string {
  const roll = rng.int(10);
  if (roll < 3) return noise(rng);
  if (roll < 6) return wellFormed(rng);
  // An edit can delete the whole message, and an empty catalog value is not a
  // message at all: the instance reads it as an untranslated key.
  if (roll < 9) return almostWellFormed(rng) || "#";
  return repetition(rng);
}

/**
 * True when a comma sits where the two shipped compilers classify the
 * argument around it differently: inside a nested brace group, or after any
 * `{` in a message that also quotes. Deliberately an over-approximation —
 * brace depth is counted with quotes ignored, and a quoted brace can hide an
 * argument from that count (`{'},'}`), so with a quote present every comma
 * past the first `{` is treated as buried.
 *
 * The default compiler calls ANY comma between an argument's braces the ICU
 * type marker; `icuCompiler` only one at the argument's own depth and outside
 * a quote, and reads `{a {b,c}}` as a parameter named `a {b,c}`. See the
 * `it.fails` case in `tests/features/message-fuzz.test.ts`.
 */
export function hasBuriedComma(message: string): boolean {
  const quotes = message.includes("'");
  let depth = 0;
  let opened = false;
  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    if (char === "{") {
      depth++;
      opened = true;
    } else if (char === "}") depth--;
    else if (char === "," && (depth >= 2 || (quotes && opened))) return true;
  }
  return false;
}

// ── Runner ──────────────────────────────────────────────────────────────────

/** `message` as a JS string literal that survives a terminal and a copy-paste. */
export function literal(message: string): string {
  let out = '"';
  for (let i = 0; i < message.length; i++) {
    const code = message.charCodeAt(i);
    const char = message[i];
    if (char === '"' || char === "\\") out += "\\" + char;
    else if (code >= 0x20 && code <= 0x7e) out += char;
    else out += "\\u" + code.toString(16).padStart(4, "0");
  }
  return out + '"';
}

// A synchronous hang cannot be interrupted by a test timeout: the timer never
// fires. `vm`'s `timeout` is a watchdog on another thread, and it covers every
// call the script makes — including the closure it is handed.
const sandbox = createContext({ run: undefined as (() => void) | undefined });
const invoke = new Script("run()");

function bounded(run: () => void, timeoutMs: number): void {
  sandbox.run = run;
  try {
    invoke.runInContext(sandbox, { timeout: timeoutMs });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
      throw new Error(`did not finish within ${timeoutMs} ms (hang)`);
    }
    throw error;
  } finally {
    sandbox.run = undefined;
  }
}

function failure(
  property: (message: string) => void,
  message: string,
  timeoutMs: number,
): Error | undefined {
  try {
    bounded(() => property(message), timeoutMs);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Delta-debugging over code points: drop ever smaller chunks while it still
 * fails. A candidate has to stay inside the property's own domain (`where`)
 * and non-empty, or the "minimal message" is one the property never claimed
 * anything about.
 */
function shrink(
  property: (message: string) => void,
  message: string,
  where: ((message: string) => boolean) | undefined,
): string {
  let chars = Array.from(message);
  const deadline = Date.now() + SHRINK_BUDGET_MS;
  for (let size = Math.ceil(chars.length / 2); size >= 1; size = Math.floor(size / 2)) {
    for (let at = 0; at < chars.length; ) {
      if (Date.now() > deadline) return chars.join("");
      const candidate = [...chars.slice(0, at), ...chars.slice(at + size)];
      const text = candidate.join("");
      if (
        text !== "" &&
        (where === undefined || where(text)) &&
        failure(property, text, SHRINK_TIMEOUT_MS) !== undefined
      ) {
        chars = candidate;
      } else {
        at += size;
      }
    }
  }
  return chars.join("");
}

export interface PropertyOptions {
  /** Draws one message. Default: {@link anyMessage}. */
  generate?: (rng: Rng) => string;
  /** Skips a drawn message the property makes no claim about. */
  where?: (message: string) => boolean;
  /** Default: `COMVI_FUZZ_RUNS`. */
  runs?: number;
}

/**
 * Runs `property` on `runs` generated messages and returns how many it
 * actually checked (the ones `where` let through) — assert on that, or a
 * filter that rejects everything turns the property into a green no-op.
 *
 * `label` salts the seed, so two properties in one file do not walk the same
 * message sequence.
 */
export function checkMessages(
  label: string,
  property: (message: string) => void,
  options: PropertyOptions = {},
): number {
  const { generate = anyMessage, where, runs = FUZZ_RUNS } = options;
  let salt = 0;
  for (let i = 0; i < label.length; i++) salt = (Math.imul(salt, 31) + label.charCodeAt(i)) | 0;
  const rng = createRng(FUZZ_SEED ^ salt);
  let checked = 0;

  for (let run = 0; run < runs; run++) {
    const message = generate(rng);
    if (where !== undefined && !where(message)) continue;
    checked++;

    const error = failure(property, message, CASE_TIMEOUT_MS);
    if (error === undefined) continue;

    const minimal = shrink(property, message, where);
    const minimalError = failure(property, minimal, CASE_TIMEOUT_MS) ?? error;
    throw new Error(
      `${label}: failed on case ${run} of seed ${FUZZ_SEED}\n` +
        `  minimal message: ${literal(minimal)}\n` +
        `  drawn message:   ${literal(message)}\n` +
        `  reproduce:       COMVI_FUZZ_SEED=${FUZZ_SEED} COMVI_FUZZ_RUNS=${Math.max(runs, run + 1)}\n` +
        `  ${minimalError.message}`,
    );
  }

  return checked;
}
