---
"@comvi/cli": patch
---

**Config discovery stops at your project, instead of walking to the filesystem
root.** `comvi` climbed from the working directory all the way up looking for
`.comvirc.json`, so a stray one in `$HOME` or in a shared CI working directory
was adopted — with whatever `apiKey` it carried.

The walk now stops at the first directory containing `package.json`, the same
bound `.env` discovery has always used. A `.comvirc.json` inside your project
tree is found exactly as before; one above your project root is not.

If you kept a config above the project on purpose, point at it explicitly with
`--config ../.comvirc.json`.
