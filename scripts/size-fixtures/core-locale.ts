// The 0.8 locale module (lot 1a): canonicalize, the script-aware parent chain, dir,
// negotiate — one module for core, the detector, Next and Nuxt.
import { canonicalize, dir, negotiate, parents } from "@comvi/core/internal";

export const out = [
  canonicalize("en_US"),
  parents("pt-BR"),
  dir("ar"),
  negotiate(["uk-UA"], ["en"]),
];
