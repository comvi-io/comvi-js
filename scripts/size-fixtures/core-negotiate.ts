// The public root entry today (lot 1a): `negotiate`, what a locale detector imports.
import { negotiate } from "@comvi/core";

export const out = negotiate(["uk-UA", "de-DE"], ["en", "de"], "en");
