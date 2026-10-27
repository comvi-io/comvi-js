import { afterEach } from "vitest";
import { _resetDiagnostics } from "../src/errors";
import { _resetIntlCache } from "../src/compile/fmt";
import { _resetLocaleCache } from "../src/locale";

// Module-level state that outlives a test: the development dedupe set and the two
// content-addressed caches (Intl formatters, likely subtags).
afterEach(() => {
  _resetDiagnostics();
  _resetIntlCache();
  _resetLocaleCache();
});
