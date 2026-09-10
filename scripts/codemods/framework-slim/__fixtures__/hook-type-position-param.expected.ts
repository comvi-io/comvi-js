// A parameter name in TYPE position binds no value, so it shadows nothing and
// must not refuse the module: the names below are erased by TypeScript, and
// both the host construction and the destructure migrate.
import { createI18n, useI18n, useI18nLoader, devtools } from "@comvi/react";

type Injected = (useI18n: () => unknown) => void;
declare function inject(createI18n: () => unknown): void;

interface Deps {
  provide(useI18n: () => unknown): void;
}

export const i18n = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: true }));

export function Consumer() {
  const { t } = useI18n();
  const { reloadTranslations } = useI18nLoader();
  reloadTranslations();
  return t("x");
}

export type { Deps, Injected };
export { inject };
