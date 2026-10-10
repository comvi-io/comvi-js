// MANUAL SETUP (advanced), kept on purpose as the backward-compatibility proof.
// The standard setup is `withComvi({ config })` in next.config plus
// `<ComviProvider>` from "@comvi/next/server" — see packages/next/README.md and
// examples/next. This app registers the instance by hand with setI18n() and
// ships its own client provider, so both paths stay built and tested.
//
// Imported for its side effect: i18n must be configured before any translation.
import "server-only";

import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./config";

setI18n(i18n);

export { i18n, routing };

export { getI18n, loadMessages } from "@comvi/next/server";

export { hasLocale } from "@comvi/next/routing";
