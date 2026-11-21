/**
 * A real core 0.8 instance on the page (`plugins: [devtools()]`) and an editor session over
 * `window.__COMVI__`, for suites that run a Core: a frame resolves to an instance only
 * through a session.
 */
import { createI18n, type I18n, type I18nOptions } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";
import { discover, Session } from "../../src/adapter";

export function pageInstance(options: Partial<I18nOptions> = {}): I18n {
  return createI18n({
    locale: "en",
    ...options,
    plugins: [devtools(), ...(options.plugins ?? [])],
  });
}

/** A session over whatever the page's queue holds now. */
export function sessionOverPage(): Session {
  const found = discover();
  if (!found.ok) throw new Error(`arrangement failed: ${found.code}`);
  return new Session(found.q, found.found);
}

/** One instance and a session over it; `end()` stops both and clears the queue. */
export function pageSession(options: Partial<I18nOptions> = {}) {
  const i18n = pageInstance(options);
  const session = sessionOverPage();
  return {
    i18n,
    session,
    end() {
      session.stop();
      i18n.destroy();
      delete (window as { __COMVI__?: unknown }).__COMVI__;
    },
  };
}
