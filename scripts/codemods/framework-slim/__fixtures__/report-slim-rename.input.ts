// Report-only — the `createSlimI18n` rename is file-wide, so anything that
// makes it unsafe refuses ALL of it and the file comes back byte-identical: a
// `createI18n` that is already bound here, and a shorthand whose KEY the rename
// would change along with the reference.
import { createSlimI18n } from "@comvi/next/client";

const createI18n = (locale: string) => createSlimI18n({ locale });

export const registry = { createSlimI18n };
export const i18n = createI18n("en");
