/**
 * The core's nested-catalog rule (`packages/core/src/flat.ts`), for `@comvi/cli`: the same
 * function, with its types restated here so this package's declarations name no core source.
 */
import { flat as rule } from "../../../core/src/flat";

/** A catalog as an app may write it: flat keys, or groups of them. */
export interface CatalogInput {
  readonly [key: string]: string | CatalogInput;
}
/** Reports a left-out key: `1` a collision, `2` an invalid leaf. */
export type FlatReport = (key: string, kind: 1 | 2) => void;

export const flat: (
  catalog: CatalogInput,
  report?: FlatReport,
) => Readonly<Record<string, string>> = rule;
