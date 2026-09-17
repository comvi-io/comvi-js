/**
 * The ONE Accept-Language input table, shared by three suites.
 *
 * `@comvi/next` and `@comvi/nuxt` used to parse and match this header each in
 * their own copy of the same twenty lines, and the copies drifted: next dropped
 * `q=0` entries from its first release, nuxt did not until 0.5. Both now route
 * through `resolveAcceptLanguage` in the workspace-private locale-routing
 * package — next imports it, nuxt vendors it — so the parity that matters is
 * that the two PUBLIC resolvers answer identically, not that two files look
 * alike.
 *
 * That is what this table is for. It is asserted three times:
 * - `packages/locale-routing/tests/accept-language.test.ts` — the shared
 *   function, directly;
 * - `packages/nuxt/tests/accept-language-parity.test.ts` — nuxt's public
 *   `resolveAcceptLanguage`;
 * - `packages/next/tests/accept-language-parity.test.ts` — next's middleware,
 *   end to end, reading the locale it resolved off `x-comvi-locale`.
 *
 * One table, three callers: a row cannot be "fixed" for one framework without
 * the other two failing. Duplicating the table per package would have let it
 * drift exactly the way the implementations did.
 *
 * `expected: undefined` means NO configured locale is acceptable. Each caller
 * says what it does with that: the shared function and nuxt's util return
 * `undefined`, next's middleware falls back to `defaultLocale` (which is
 * `locales[0]` for every row here).
 *
 * This file is a workspace-package export rather than a relative import so it
 * resolves from inside a Stryker sandbox, where paths out of the package under
 * mutation do not exist — the same reason `fakeI18n.ts` lives here.
 */

export interface AcceptLanguageCase {
  /** The `Accept-Language` header value, verbatim. */
  header: string;
  /** Configured locales, in configuration order. `[0]` is the default locale. */
  locales: readonly string[];
  /** The configured spelling that must be selected, or `undefined` for none. */
  expected: string | undefined;
  /** What the row pins. Becomes the test name. */
  why: string;
}

const BASE = ["en", "de", "fr", "uk"] as const;
const REGIONAL = ["en-US", "en-GB", "de-DE"] as const;
const BRAZIL = ["pt-BR", "en"] as const;
const CHINESE = ["zh-Hant-TW", "zh-Hans", "en"] as const;

export const ACCEPT_LANGUAGE_CASES: readonly AcceptLanguageCase[] = [
  // — the ordinary cases —
  { header: "de", locales: BASE, expected: "de", why: "a single exact tag" },
  {
    header: "en-US,fr;q=0.5",
    locales: BASE,
    expected: "en",
    why: "the most preferred tag falls back to its base language",
  },
  {
    header: "uk;q=0.7,de;q=0.9,en;q=0.5",
    locales: BASE,
    expected: "de",
    why: "entries are tried in descending q order, not header order",
  },
  {
    header: "en-GB,en-US;q=0.9,en;q=0.8,uk;q=0.7,de;q=0.5",
    locales: BASE,
    expected: "en",
    why: "a long realistic header still resolves through the base language",
  },
  {
    header: "ja,de;q=0.5",
    locales: BASE,
    expected: "de",
    why: "an unsupported first choice is skipped, not fatal",
  },
  {
    header: "ja,zh;q=0.9",
    locales: BASE,
    expected: undefined,
    why: "nothing acceptable leaves the caller to decide",
  },

  // — case folding, and the configured spelling comes back out —
  { header: "DE", locales: BASE, expected: "de", why: "matching is case-insensitive" },
  {
    header: "DE-de",
    locales: BASE,
    expected: "de",
    why: "a mixed-case subtagged form still finds its base language",
  },
  {
    header: "pt-br",
    locales: BRAZIL,
    expected: "pt-BR",
    why: "a lowercased region matches, and the CONFIGURED spelling is returned",
  },
  {
    header: "pt-BR",
    locales: BRAZIL,
    expected: "pt-BR",
    why: "the canonical spelling matches the same locale as the lowercased one",
  },
  {
    header: "PT-BR",
    locales: BRAZIL,
    expected: "pt-BR",
    why: "an all-caps tag is the same request",
  },

  // — the fallback direction, in both directions —
  {
    header: "en",
    locales: REGIONAL,
    expected: "en-US",
    why: "a bare language takes the FIRST configured locale under it",
  },
  {
    header: "pt",
    locales: BRAZIL,
    expected: "pt-BR",
    why: "the only regional variant serves the bare language",
  },
  {
    header: "pt-PT",
    locales: BRAZIL,
    expected: "pt-BR",
    why: "a different region falls back through the shared base language",
  },
  {
    header: "en-US;q=0.9,en;q=0.8",
    locales: REGIONAL,
    expected: "en-US",
    why: "an exact match beats the base-language entry ranked below it",
  },
  {
    header: "zh-Hant-TW",
    locales: CHINESE,
    expected: "zh-Hant-TW",
    why: "a three-subtag exact match",
  },
  {
    header: "zh-hant-tw",
    locales: CHINESE,
    expected: "zh-Hant-TW",
    why: "a three-subtag tag folds case like any other",
  },
  {
    header: "zh-Hans-CN",
    locales: CHINESE,
    expected: "zh-Hant-TW",
    why: "script subtags are NOT weighed: the first locale under base `zh` wins",
  },
  {
    header: "zh",
    locales: CHINESE,
    expected: "zh-Hant-TW",
    why: "the bare base language picks the first `zh-` locale in configuration order",
  },

  // — q=0 is a refusal, not a low rank (RFC 9110 §12.4.2) —
  {
    header: "fr;q=0",
    locales: ["en", "fr"],
    expected: undefined,
    why: "q=0 refuses the only matching locale, so nothing is acceptable",
  },
  {
    header: "fr;q=0,en;q=0.8",
    locales: ["en", "fr"],
    expected: "en",
    why: "a refused entry is dropped and the next one is honoured",
  },
  {
    header: "fr-CA;q=0,de;q=0.5",
    locales: BASE,
    expected: "de",
    why: "a refusal is dropped before the base-language fallback can rescue it",
  },
  {
    header: "fr;q=0.000",
    locales: BASE,
    expected: undefined,
    why: "any spelling of zero is a refusal",
  },
  {
    header: "fr;q=00",
    locales: BASE,
    expected: undefined,
    why: "a non-canonical zero is still zero",
  },
  {
    header: "fr;q=0.001",
    locales: BASE,
    expected: "fr",
    why: "the smallest non-zero q is still acceptable",
  },
  {
    header: "fr;q=-1,de;q=0.5",
    locales: BASE,
    expected: "de",
    why: "a negative q is not acceptable either",
  },

  // — `*` —
  {
    header: "*",
    locales: BASE,
    expected: undefined,
    why: "`*` is not expanded: it names no configured locale",
  },
  {
    header: "*;q=1,de;q=0.5",
    locales: BASE,
    expected: "de",
    why: "a top-ranked `*` matches nothing and yields to the next entry",
  },
  {
    header: "de;q=0.5,*",
    locales: BASE,
    expected: "de",
    why: "`*` outranking a real tag still cannot select anything itself",
  },

  // — malformed, and the default q —
  {
    header: "de;q=abc,en;q=0.5",
    locales: BASE,
    expected: "de",
    why: "an unparseable q means most-preferred, not least",
  },
  {
    header: "fr;q=,de;q=0.8",
    locales: BASE,
    expected: "fr",
    why: "an empty q value means most-preferred",
  },
  {
    header: "fr;q,de;q=0.8",
    locales: BASE,
    expected: "fr",
    why: "a bare `;q` with no `=` means most-preferred",
  },
  {
    header: "fr;,de;q=0.8",
    locales: BASE,
    expected: "fr",
    why: "a stray semicolon with no parameter at all means most-preferred",
  },
  {
    header: ",de;q=0.5",
    locales: BASE,
    expected: "de",
    why: "an empty entry from a leading comma is dropped",
  },
  {
    header: ",",
    locales: BASE,
    expected: undefined,
    why: "a header of only separators matches nothing",
  },
  { header: "", locales: BASE, expected: undefined, why: "an empty header matches nothing" },
  {
    header: "   de   ",
    locales: BASE,
    expected: "de",
    why: "surrounding whitespace is trimmed off the tag",
  },
  {
    header: "de ;q=0.9",
    locales: BASE,
    expected: "de",
    why: "whitespace before the parameter separator is trimmed too",
  },
  {
    header: "en;q=1.5,de;q=0.9",
    locales: BASE,
    expected: "en",
    why: "a q above 1 is taken at face value rather than clamped",
  },
  {
    header: "en;level=1;q=0.5,de;q=0.4",
    locales: BASE,
    expected: "en",
    why: "only the FIRST parameter is read for q, so a leading `level=` hides it and q defaults to 1",
  },
  {
    header: "en;Q=0.5,de;q=0.9",
    locales: BASE,
    expected: "de",
    why: "the parameter name is not case-checked: `Q=0.5` is read as the q value",
  },
  {
    header: "en;q=0.5,de;q=0.5",
    locales: BASE,
    expected: "en",
    why: "ties keep header order (the sort is stable)",
  },
  {
    header: "de;q=0.5,en;q=0.5",
    locales: BASE,
    expected: "de",
    why: "the same tie, reversed, proves order comes from the header and not from `locales`",
  },
  {
    header: "-en,de;q=0.5",
    locales: BASE,
    expected: "de",
    why: "a tag whose first subtag is empty matches nothing",
  },
  {
    header: "en-,de;q=0.5",
    locales: BASE,
    expected: "en",
    why: "a trailing hyphen still yields base language `en`",
  },
];
