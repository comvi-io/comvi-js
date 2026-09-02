---
"@comvi/cli": minor
---

`comvi push` now exits with code 4 when the force mode is invalid, whether it came from
`--force-mode` or from `push.forceMode` in `.comvirc.json`. It used to exit 1, which is the
generic-failure code, while every other validation failure — an unparseable config, an unknown
namespace — already exited 4. Scripts that branch on the exit code can now treat 4 as "you gave
me bad input" for this case too; anything still checking for 1 here needs updating.
