// Framework size fixture: the next.config plugin, `@comvi/next/plugin`. It runs
// in Node from next.config and never reaches an app bundle, so this row only
// guards against the plugin growing a runtime import (core, React, the host).
import { withComvi } from "@comvi/next/plugin";

console.log(withComvi({ config: "./src/i18n/config.ts" }));
