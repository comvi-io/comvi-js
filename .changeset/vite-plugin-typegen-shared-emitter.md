---
"@comvi/vite-plugin": minor
---

Type generation now runs on `@comvi/typegen`, the emitter `@comvi/cli` shares, so the two tools cannot drift. The header line is unchanged, and so is every type the declarations carry.

**The declarations themselves change once, so regenerate and commit the result in the upgrade commit.** Two differences, both fixes the shared emitter brings with it:

- **Keys and parameter names are quoted with `JSON.stringify`** where the plugin emitted single quotes and bare parameter names. 0.4.1 wrote `'errors.it's': never;`, which closes its own quote, and `{ user-name: string }`, which is not a legal property name; neither file parses. They are now `"errors.it's"` and `{ "user-name": string }`.
- **Keys are sorted in code-unit order** (`Object.keys().sort()`) where the plugin sorted with `localeCompare`. The two orders disagree on any pair that differs only in case, so `apple` / `Apple` swap places. The CLI has always used code-unit order, and this is what made the two tools' output differ.

One behaviour follows from the shared copy: two keys that converge once the default namespace is stripped are now refused with a `Translation key collision` error. The plugin used to keep whichever key came last, so a key disappeared from the declarations silently. `@comvi/cli` has always refused it. During a build the refusal throws, so a schema that built yesterday can fail `vite build`; `vite dev` reports it and carries on.
