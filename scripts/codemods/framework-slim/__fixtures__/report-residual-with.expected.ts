// The reporting half of the residual sweep, and the line it must NOT cross.
//
// `getHost()` may well return a 0.5-pre host: the argument is installer-shaped,
// the codemod cannot see through the call, and the rename is the reader's to
// make — so it is reported, and the tree is not certified clean.
//
// `someDate.with({ month: 2 })` is Temporal. `with` is not a Comvi word, and
// the retired verb only ever took a CALL or a bare `attach*` reference, so an
// object literal in the slot says this receiver is somebody else's API. The
// codemod is silent: an app that uses Temporal or `Array.prototype.with` must
// not carry a manual item for a verb it never wrote.
import { loader } from "@comvi/core/loader";

declare const getHost: () => { with: <R>(installer: (host: unknown) => R) => R };
declare const someDate: { with: (fields: { month: number }) => unknown };

export const composedElsewhere = getHost().with(loader());

export const shifted = someDate.with({ month: 2 });

export const swapped = ["en", "de"].with(0, "uk");
