// Framework size fixture: the next.config plugin, `@comvi/next/plugin`. Node
// tooling: it runs from next.config and never reaches an app or browser bundle.
// The graph is the whole plugin, typegen included (`withComvi({ types })` imports
// it statically), so the row guards against a runtime import (core, React, the
// host) creeping in.
import { withComvi } from "@comvi/next/plugin";

console.log(withComvi());
