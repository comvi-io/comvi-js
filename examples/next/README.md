# Comvi + Next.js (App Router)

The locale lives in the URL: `/en`, `/uk` and `/de` are prerendered pages, the middleware
redirects `/` to the visitor's locale, and the switcher navigates between them. See
[`../README.md`](../README.md) for what every example shows and how to run it.

<!--
  `next` is pinned to `~15.4.11` on purpose. StackBlitz runs this example in WebContainers, and
  Next 15.5 and later do not start there (vercel/next.js#84026). Move the pin forward once that
  issue is fixed; the code needs no change for a newer 15.x or 16.x.
-->
