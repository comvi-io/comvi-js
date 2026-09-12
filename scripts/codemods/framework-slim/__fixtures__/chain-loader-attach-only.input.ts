// Row 14: `loader(importMap)` REQUIRES its map in 0.5.0, so a bare `loader()`
// — attach-only against the 0.5 pre-release, and the third spelling of one
// capability — becomes the bare `attachLoader` it always delegated to. The
// argument changes and nothing else does: same host, same position, same
// evaluation order, and the import-map adapter that static reference dragged
// into the graph goes with it.
//
// Four shapes, one rule:
//
//   • `attachOnly` is the migration, and `attachLoader` is merged into the
//     clause `loader` already came through — both names live on every entry
//     that publishes either, so no second import of the same module is opened.
//   • `configured` already passes a map and is untouched. It is also why
//     `loader` SURVIVES in the clause: the prune is "no remaining reference",
//     a property of the output, and this file still has one.
//   • `aliased` reaches the same installer under a local name. The alias is
//     followed through to its import and the call is rewritten under it.
//   • `spread` hands the call arguments the text does not name. One of them may
//     well be a map, so rewriting it would silently drop a registration: it is
//     REPORTED and left exactly as written.
import { attachPlugins, createI18n, loader } from "@comvi/react";
import { loader as makeLoader } from "@comvi/core/loader";

export const attachOnly = createI18n({ locale: "en" }).use(loader());

export const configured = createI18n({ locale: "en" })
  .use(loader({ uk: () => Promise.resolve({}) }))
  .use(attachPlugins);

export const aliased = createI18n({ locale: "en" }).use(makeLoader());

declare const maps: [Record<string, () => Promise<unknown>>];

export const spread = createI18n({ locale: "en" }).use(loader(...maps));
