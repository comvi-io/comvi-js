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

Known engine difference: V8 prints U+0020 before AM/PM in `en` dates where ICU4C 78
prints U+202F; the golden test normalizes that one character in Date rows.
