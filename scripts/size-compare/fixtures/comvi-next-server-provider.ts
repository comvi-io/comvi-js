// Framework size fixture: the next SERVER graph of the `withComvi` setup — the
// layout's `<ComviProvider>` and the page's `getI18n({ locale })`, every
// specifier `@comvi/next/server`. What Next keeps of the provider's
// `"use client"` half on the server is a client reference, so that module is
// external here, and so is `@comvi/next/config`, which `withComvi` aliases to
// the APP's own config module (counted in the app's bundle, not this row).
import { ComviProvider, getI18n } from "@comvi/next/server";

console.log(ComviProvider, getI18n);
