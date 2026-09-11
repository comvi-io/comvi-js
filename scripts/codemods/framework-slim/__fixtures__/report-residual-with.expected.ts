// The other half of the residual sweep: a `.with(` whose receiver cannot be
// proven to be a Comvi host is REPORTED, never rewritten.
//
// Both directions matter. `getHost()` may well return a 0.5-pre host, and the
// rename is the reader's to make because the codemod cannot see through the
// call. `someDate.with({ month: 2 })` is Temporal and needs nothing at all —
// which the report says, rather than pretending otherwise. What neither shape
// may do is disappear: a tree that still calls `with` is not a clean tree.
import { loader } from "@comvi/core/loader";

declare const getHost: () => { with: <R>(installer: (host: unknown) => R) => R };
declare const someDate: { with: (fields: { month: number }) => unknown };

export const composedElsewhere = getHost().with(loader());

export const shifted = someDate.with({ month: 2 });
