import { afterEach } from "vitest";
import { cleanup } from "@solidjs/testing-library";
import { _resetDiagnostics } from "../../core/src/errors";
import { _resetIntlCache } from "../../core/src/compile/fmt";
import { _resetLocaleCache } from "../../core/src/locale";

// Every rendered root is disposed after its test; the core's module-level caches (dev dedupe,
// Intl, likely subtags) outlive a test too.
afterEach(() => {
  cleanup();
  _resetDiagnostics();
  _resetIntlCache();
  _resetLocaleCache();
});
