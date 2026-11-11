/**
 * The catalog source of the Next test apps (`COMVI_E2E_CATALOGS`): serves `test-apps/locales`
 * (`/<ns>/<locale>.json`; `default` is `<locale>.json`, any other namespace `<ns>/<locale>.json`)
 * and lets the e2e steer each (locale, namespace) pair, so a test waits on concrete states
 * instead of time:
 *
 *   POST /__mode    {"hold": ["uk:admin"], "fail": ["uk:admin"]} — replaces the modes
 *   POST /__release {"pair": "uk:admin"} — answers the held requests of the pair
 *   GET  /__log     every request so far: {pair, from: "server" | "browser", status}
 *   GET  /__held    the pairs with a request held now
 *   POST /__reset   clears the log and the modes, answers every held request
 *
 * A request with the server's `authorization` header is `from: "server"`; anything else (the
 * browser loader) is `from: "browser"`. Every response allows any origin.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export function startCatalogMock(dir, port = 0) {
  let mode = { hold: [], fail: [] };
  let log = [];
  /** Held requests: [pair, answer()]. */
  let held = [];
  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
    });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    });
  const release = (pair) => {
    const out = held.filter(([p]) => pair === undefined || p === pair);
    held = held.filter((h) => !out.includes(h));
    for (const [, answer] of out) answer();
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (url.pathname === "/__mode")
      return json(res, 200, (mode = { hold: [], fail: [], ...(await readBody(req)) }));
    if (url.pathname === "/__release") return json(res, 200, release((await readBody(req)).pair));
    if (url.pathname === "/__log") return json(res, 200, log);
    if (url.pathname === "/__held")
      return json(
        res,
        200,
        held.map(([p]) => p),
      );
    if (url.pathname === "/__reset") {
      mode = { hold: [], fail: [] };
      log = [];
      release();
      return json(res, 200, {});
    }
    const m = /^\/([\w-]+)\/([\w-]+)\.json$/.exec(url.pathname);
    if (!m) return json(res, 404, {});
    const [, ns, locale] = m;
    const pair = `${locale}:${ns}`;
    const entry = { pair, from: req.headers.authorization ? "server" : "browser", status: 0 };
    log.push(entry);
    const answer = () => {
      const file = path.join(dir, ns === "default" ? `${locale}.json` : `${ns}/${locale}.json`);
      entry.status = mode.fail.includes(pair) ? 500 : fs.existsSync(file) ? 200 : 404;
      if (entry.status !== 200) return json(res, entry.status, {});
      json(res, 200, JSON.parse(fs.readFileSync(file, "utf8")));
    };
    if (mode.hold.includes(pair)) held.push([pair, answer]);
    else answer();
  });
  return new Promise((resolve, reject) =>
    server.once("error", reject).listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            release();
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      }),
    ),
  );
}
