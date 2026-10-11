// The instances the message fuzz suites render through, and the one way they
// render: a fresh instance per message, so ingestion is part of every case.
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { tagSyntaxExtension } from "../../src/core/translate/tags";
import type { I18nOptions } from "../../src/types";

type Variant = { name: string; options: Partial<I18nOptions> };

const TAGS = { tagInterpolation: { extensions: [tagSyntaxExtension] } };

export const DEFAULT: Variant = { name: "default compiler", options: {} };
export const ICU: Variant = { name: "icuCompiler", options: { compiler: icuCompiler } };
export const DEFAULT_TAGS: Variant = { name: "default compiler + tags", options: TAGS };
export const ICU_TAGS: Variant = {
  name: "icuCompiler + tags",
  options: { compiler: icuCompiler, ...TAGS },
};

/** Both compilers, each without and with the tag grammar on the instance. */
export const VARIANTS = [DEFAULT, ICU, DEFAULT_TAGS, ICU_TAGS];

// Below 1000 on purpose: how `#` formats a count with a grouping separator is
// not this suite's subject.
const COUNTS = [0, 1, 2, 5, 21, 1.5, -1];

export interface Outcome {
  /** The catalog was refused at ingestion with `E_ICU_SYNTAX` (development only). */
  rejected: boolean;
  /** What `t()` returned; `undefined` when the catalog was refused. */
  rendered: unknown;
}

/**
 * Ingests `message` as the whole catalog and renders it with every parameter
 * the generator can name. The count varies with the message, so plural
 * branches other than `other` get chosen.
 *
 * `E_ICU_SYNTAX` at INGESTION is the documented development answer to an
 * argument the compiler cannot compile, so it is an outcome. Anything else
 * that throws — another error at ingestion, or any error from `t()` — is not
 * caught here and fails the property.
 */
export function ingestAndRender(message: string, variant: Variant): Outcome {
  let i18n;
  try {
    i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      // Production reports a literal ICU segment here; without a handler it
      // would also write to the console on every case.
      onError: () => {},
      ...variant.options,
      messages: { en: { message } },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "E_ICU_SYNTAX") {
      return { rejected: true, rendered: undefined };
    }
    throw error;
  }

  const rendered = i18n.t("message", {
    name: "Ada",
    count: COUNTS[message.length % COUNTS.length],
    gender: "female",
    n: 1,
  });

  return { rejected: false, rendered };
}
