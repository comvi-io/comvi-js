// vue-i18n with the message already compiled to a message function, the shape
// @intlify/unplugin-vue-i18n emits, so the build can drop the runtime message
// compiler (__INTLIFY_DROP_MESSAGE_COMPILER__) and still translate.
import { createI18n, useI18n } from "vue-i18n";

type Ctx = {
  normalize: (parts: unknown[]) => string;
  interpolate: (value: unknown) => unknown;
  named: (key: string) => unknown;
};
const greeting = (ctx: Ctx) => {
  const { normalize: _normalize, interpolate: _interpolate, named: _named } = ctx;
  return _normalize(["Hello, ", _interpolate(_named("name")), "!"]);
};

const i18n = createI18n({ legacy: false, locale: "en", messages: { en: { greeting } } });
console.log(i18n.global.t("greeting", { name: "world" }), useI18n);
