// a plugin the codemod does not know is WRAPPED: `.use(definePlugin(p))`.
//
// The wrap is what makes this positional. `definePlugin(fn)` attaches the
// plugin capability itself, so nothing has to be inserted in front of the step
// and the step stays exactly where the author put it — the first chain's
// `plugins()` is left where it is, and the third chain, which composed the
// capability AFTER its own plugin, needs no correction at all.
import { createI18n } from "@comvi/core";
import { plugins, definePlugin } from "@comvi/core/plugins";
import { Analytics } from "./analytics";

export const composed = createI18n({ locale: "en" }).use(plugins()).use(definePlugin(Analytics({ id: 1 })));

export const bare = createI18n({ locale: "en" }).use(definePlugin(Analytics({ id: 2 })));

export const late = createI18n({ locale: "en" })
  .use(definePlugin(Analytics({ id: 3 })))
  .use(plugins());

// An INLINE plugin is the shape the helper exists for, and the one case that
// needs no naming convention at all: a function expression in the slot cannot
// be an installer, because an installer returns the host it was given.
export const own = createI18n({ locale: "en" }).use(definePlugin((host) => {
  void host.t("ready");
}));
