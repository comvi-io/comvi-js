// Report-only (§7.3) — a first-party factory NAME that is not a first-party
// import. The lowercase installer lives in the package the uppercase factory
// came from, so a call the codemod cannot resolve to that package is a call it
// cannot rewrite.
import { createI18n } from "@comvi/react";
import * as fetchLoaderPackage from "@comvi/plugin-fetch-loader";

const FetchLoader = fetchLoaderPackage.FetchLoader;

// A hand-rolled detector that happens to carry the first-party name.
function LocaleDetector(order: string[]) {
  return () => order.length;
}

export const remote = createI18n({ locale: "en" }).use(FetchLoader({ cdnUrl: "https://cdn" }));
export const detected = createI18n({ locale: "en" }).use(LocaleDetector(["cookie"]));
