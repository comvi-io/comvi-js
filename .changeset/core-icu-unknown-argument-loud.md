---
"@comvi/core": minor
---

ICU arguments the compiler does not implement now fail the same way ICU syntax already failed on
the default compiler: development throws at ingestion, production renders the text literally and
reports `E_ICU_SYNTAX`. The ICU compiler supports `plural`, `selectordinal` and `select` — those
three only.

- **An unsupported argument type used to become a parameter name.** `{price, number}` compiled to a
  parameter literally named `price, number`, so the message rendered as `{price, number}` with a
  "Missing parameter" warning that pointed at a parameter you never wrote. It now throws in
  development, quoting the argument, naming the three types that are implemented and giving the two
  ways out: quote the braces, or format the value in your own code and pass the result as a plain
  `{param}`. An argument with no choice list at all (`{n, plural}`) gets the same message. Number,
  date and time formats are not planned.
- **A malformed choice list used to render a wrong branch or an empty string.** A selector with no
  braced sub-message (`{count, plural, one {one} other oops}`) or a sub-message whose brace never
  closes stopped the parse where it broke and kept whatever had been read so far. Both now throw in
  development, quoting the choice list that could not be parsed.
- **Production behaviour is unchanged in shape.** Nothing throws at runtime: the braced segment
  renders as written and one `E_ICU_SYNTAX` report reaches your `onError` handler with the key,
  namespace and locale, exactly as it already did for ICU syntax on the default compiler.
- Development now preflights ingested catalogs with the ICU compiler too, not just the default one,
  so a broken message throws where the catalog was added rather than at first render. Catalogs
  ingested through a compiler you supplied yourself are not preflighted.
