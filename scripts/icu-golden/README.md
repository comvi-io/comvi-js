# ICU golden tables

The message compiler of `@comvi/core` is tested against renderings by reference
implementations, stored as fixtures in `packages/core/tests/golden/`. CI only reads them.

| Fixture         | Reference                                                 | Generator          |
| --------------- | --------------------------------------------------------- | ------------------ |
| `icu4c.json`    | ICU4C 78 `MessageFormat` (ApostropheMode DOUBLE_OPTIONAL) | `gen-icu4c.mjs`    |
| `formatjs.json` | `intl-messageformat` 10.7.16 (lot-0 S3 subset)            | `gen-formatjs.mjs` |

`cases.mjs` is the ICU4C case list: the 0.8 grammar only (plural, selectordinal, select,
`=N`, `offset:`, `#`, quoting, plain `{x}`), plus templates ICU4C rejects (`error: true`).

Regenerate after editing a case list:

```bash
# ICU4C (macOS: brew install icu4c@78)
node scripts/icu-golden/gen-icu4c.mjs --icu /opt/homebrew/opt/icu4c@78

# intl-messageformat, installed outside the workspace
npm install --prefix /tmp/imf intl-messageformat@10.7.16
node scripts/icu-golden/gen-formatjs.mjs /tmp/imf/node_modules/intl-messageformat
```

Where core differs from ICU4C on purpose, the generator still lets ICU4C render the row and
marks it: `coerced` rows pass a numeric string as a plural count (ICU4C renders
`Number(string)`, owner decision 27.10.2026); `plain` rows have a plain `{x}` holding a number,
which core prints as `String(value)` with no Intl (owner decision R3-17, 28.10.2026), so ICU4C
gets that argument as the string `String(value)` and formats only the rest (`#`). There are
no Date rows: a plain `{d}` prints `String(date)`, which depends on the process time zone.
