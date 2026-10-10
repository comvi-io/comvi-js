---
"@comvi/cli": minor
---

**BREAKING (breaking change on a 0.x minor): type generation has one command name, `comvi typegen`.** The `generate-types` and `generate` spellings are removed; `comvi init` prints `comvi typegen` in its next steps.

**BREAKING (breaking change on a 0.x minor): `.comvirc.json` refuses fields it does not have.** A field `ComviConfig` does not declare fails `load` with exit code 4 and names it: `".comvirc.json" field "outputDir" is not an option.` For `languages` the message says `use "locales"`; for `defaultNsName` it says the default namespace is read from the TMS, so delete it. Both used to be dropped with a warning.
