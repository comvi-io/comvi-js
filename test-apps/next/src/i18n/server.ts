import "server-only";
import http from "node:http";
import { createGetI18n } from "@comvi/next/server";
import type { Catalog } from "@comvi/core";
import { options, routing } from "./routing";

/**
 * A server credential for the catalog source. The e2e (scenario 10) checks that it never
 * reaches a client chunk.
 */
const SERVER_TOKEN = "comvi-e2e-server-secret-5d1c9f";

/**
 * The catalog source of the e2e: an HTTP server the test controls (`COMVI_E2E_CATALOGS`). Read
 * over `node:http`, not `fetch`, so Next neither caches it nor turns a static page dynamic.
 */
const get = (locale: string, ns: string) =>
  new Promise<Catalog>((resolve, reject) => {
    const base = process.env.COMVI_E2E_CATALOGS;
    if (!base) return reject(new Error("COMVI_E2E_CATALOGS is not set"));
    http
      .get(
        `${base}/${ns}/${locale}.json`,
        { headers: { authorization: `Bearer ${SERVER_TOKEN}` } },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            res.statusCode === 200
              ? resolve(JSON.parse(body))
              : reject(new Error(`${ns}/${locale}: ${res.statusCode}`)),
          );
        },
      )
      .on("error", reject);
  });

export const getI18n = createGetI18n({
  ...routing,
  ...options,
  timeZone: "Pacific/Kiritimati",
  loader: get,
});
