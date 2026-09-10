// Report-only — a host name the module ALSO declares locally is refused at
// every construction: the codemod cannot tell which binding a call resolves
// to, and rewriting the shadowed one corrupts an unrelated function.
import { createI18n, I18n } from "@comvi/core";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

export function fromParameter(createI18n) {
  return createI18n({ exposeGlobal: true });
}

export function fromTypedParameter(createI18n: (options: unknown) => unknown) {
  return createI18n({ instanceId: "typed" });
}

export function fromLocalConst() {
  const createI18n = (options: unknown) => options;
  return createI18n({ exposeGlobal: false });
}

export function fromClassParameter(I18n) {
  return new I18n({ instanceId: "class" });
}

export function withPluginUse(createI18n) {
  return createI18n({ locale: "en" }).use(FetchLoader({ cdnUrl: "/x" }));
}
