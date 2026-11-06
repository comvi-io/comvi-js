import { afterEach } from "vitest";
import { _resetDiagnostics } from "../../core/src/errors";
import { _resetIntlCache } from "../../core/src/compile/fmt";
import { _resetLocaleCache } from "../../core/src/locale";

// The core's module-level caches (dev dedupe, Intl, likely subtags) outlive a test.
afterEach(() => {
  _resetDiagnostics();
  _resetIntlCache();
  _resetLocaleCache();
});
