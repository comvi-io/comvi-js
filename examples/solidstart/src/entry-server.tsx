// @refresh reload
import { getRequestEvent } from "solid-js/web";
import { createHandler, StartServer } from "@solidjs/start/server";
import { getTextDirection } from "@comvi/core";
import { fallbackLocale, locales } from "~/lib/i18n";

/** The locale prefix of this request's URL, checked against `locales`. */
function requestLocale() {
  const segment = new URL(getRequestEvent()!.request.url).pathname.split("/")[1];
  return locales.includes(segment) ? segment : fallbackLocale;
}

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang={requestLocale()} dir={getTextDirection(requestLocale())}>
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
));
