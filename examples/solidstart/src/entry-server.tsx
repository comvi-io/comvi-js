// @refresh reload
import { getRequestEvent, useAssets } from "solid-js/web";
import { createHandler, StartServer } from "@solidjs/start/server";
import { handover } from "@comvi/solid";
import { dir } from "@comvi/core/internal";
import { fallbackLocale, locales } from "~/lib/i18n";

/** The locale prefix of this request's URL, checked against `locales`. */
function requestLocale() {
  const segment = new URL(getRequestEvent()!.request.url).pathname.split("/")[1];
  return segment && locales.includes(segment) ? segment : fallbackLocale;
}

/**
 * What the browser's instance starts from. An asset runs once the catalogs the response waits
 * for are in, so it carries what the render loaded; `<` is escaped, it sits in a script.
 */
function i18nPayload() {
  const i18n = getRequestEvent()!.locals.i18n;
  if (!i18n) return undefined; // the 404 page has no translations
  const payload = JSON.stringify(handover(i18n)).replace(/</g, "\\u003c");
  return <script innerHTML={`window.__I18N__=${payload}`} />;
}

export default createHandler(() => {
  useAssets(i18nPayload);
  return (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang={requestLocale()} dir={dir(requestLocale())}>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {assets}
          </head>
          <body>
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      )}
    />
  );
});
