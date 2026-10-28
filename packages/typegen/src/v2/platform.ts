/**
 * The Comvi platform as a typegen source: `GET /v1/project` names the API key's project,
 * `GET /v1/projects/:id/schema/v2` returns its wire schema v2. Watching uses the v1 SSE
 * stream (`/schema/stream`) only as a change signal and fetches v2 on each event — no
 * platform endpoint of its own.
 *
 * The API key comes from the options or `COMVI_API_KEY`; it is sent as a Bearer token
 * and never appears in a message, an error or a file.
 */
import { parseWireSchema, type WireSchema } from "./wire";

export interface PlatformSourceOptions {
  /** @default process.env.COMVI_API_KEY */
  apiKey?: string;
  /** @default process.env.COMVI_API_BASE_URL ?? 'https://api.comvi.io' */
  apiBaseUrl?: string;
  /** For tests and proxies. @default globalThis.fetch */
  fetch?: typeof fetch;
}

export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PlatformError";
  }
}

export class PlatformSource {
  private readonly key: string;
  readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private projectId: Promise<number> | undefined;

  constructor(options: PlatformSourceOptions = {}) {
    const key = options.apiKey ?? process.env.COMVI_API_KEY;
    if (!key)
      throw new PlatformError(
        "An API key is required to generate types from the Comvi platform: set COMVI_API_KEY (never commit it)",
      );
    this.key = key;
    const base = options.apiBaseUrl ?? process.env.COMVI_API_BASE_URL ?? "https://api.comvi.io";
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new PlatformError(
        `apiBaseUrl must be an http(s) URL, received ${JSON.stringify(base)}`,
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new PlatformError(
        `apiBaseUrl must be an http(s) URL, received ${JSON.stringify(base)}`,
      );
    this.baseUrl = base.replace(/\/+$/, "");
    this.doFetch = options.fetch ?? globalThis.fetch;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, Accept: "application/json" };
  }

  private async json(path: string, what: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.doFetch(this.baseUrl + path, { headers: this.headers() });
    } catch (e) {
      // fetch reports every network failure as "fetch failed"; why sits on its cause.
      const why = (e as { cause?: { code?: unknown } }).cause?.code;
      const reason = typeof why === "string" ? ` (${why})` : "";
      throw new PlatformError(
        `Cannot reach ${this.baseUrl} for the ${what}: ${(e as Error).message}${reason}`,
        undefined,
        { cause: e },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const reason =
        response.status === 401
          ? "the API key was rejected"
          : response.status === 403
            ? "the API key may not read the schema (scope schema:read)"
            : `HTTP ${response.status}`;
      throw new PlatformError(
        `Cannot read the ${what} from ${this.baseUrl}: ${reason}`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new PlatformError(`The ${what} from ${this.baseUrl} is not JSON`);
    }
  }

  /** The key's project id: asked once (concurrent callers share the request), again after a failure. */
  project(): Promise<number> {
    if (this.projectId) return this.projectId;
    const asked = (async () => {
      const info = (await this.json("/v1/project", "project of the API key")) as { id?: unknown };
      if (typeof info?.id !== "number")
        throw new PlatformError(
          `The project of the API key from ${this.baseUrl} has no numeric id`,
        );
      return info.id;
    })();
    asked.catch(() => {
      if (this.projectId === asked) this.projectId = undefined;
    });
    return (this.projectId = asked);
  }

  async schema(): Promise<WireSchema> {
    const id = await this.project();
    return parseWireSchema(await this.json(`/v1/projects/${id}/schema/v2`, "typegen schema v2"));
  }

  /**
   * Calls `onChange` for every event of the project's schema stream (the first arrives on
   * connect). Reconnects with growing waits (1 s … 30 s) when the stream ends, fails or
   * stays silent for 45 s (the platform pings every 15 s); stops for good when the key is
   * refused (401/403, on the project lookup or the stream) and reports through `onFatal`.
   * Returns the function that stops it.
   */
  subscribe(
    onChange: () => void,
    hooks: { onNotice?: (m: string) => void; onFatal?: (e: PlatformError) => void } = {},
  ): () => void {
    let stopped = false;
    let attempt = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const retry = (reason: string) => {
      if (stopped) return;
      const wait = Math.min(1000 * 2 ** attempt++, 30_000);
      hooks.onNotice?.(`schema stream ${reason}; reconnecting in ${Math.round(wait / 1000)} s`);
      timer = setTimeout(open, wait);
    };

    const open = async () => {
      if (stopped) return;
      controller = new AbortController();
      const ctl = controller;
      let silence: ReturnType<typeof setTimeout> | undefined;
      const alive = () => {
        clearTimeout(silence);
        silence = setTimeout(() => ctl.abort(new Error("silent")), 45_000);
      };
      const fatal = (error: PlatformError) => {
        stopped = true;
        hooks.onFatal?.(error);
      };
      try {
        let id: number;
        try {
          id = await this.project();
        } catch (e) {
          // A refused key does not get better by retrying.
          if (e instanceof PlatformError && (e.status === 401 || e.status === 403)) {
            if (!stopped) fatal(e);
            return;
          }
          throw e;
        }
        alive();
        const response = await this.doFetch(`${this.baseUrl}/v1/projects/${id}/schema/stream`, {
          headers: { ...this.headers(), Accept: "text/event-stream" },
          signal: ctl.signal,
        });
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel().catch(() => undefined);
          fatal(
            new PlatformError(
              `The schema stream refused the API key (HTTP ${response.status})`,
              response.status,
            ),
          );
          return;
        }
        if (!response.ok || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(`HTTP ${response.status}`);
        }
        if (attempt > 0) hooks.onNotice?.("schema stream reconnected");
        attempt = 0;
        const decoder = new TextDecoder();
        let buffer = "";
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          alive();
          buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, "\n");
          let end: number;
          // An event ends at a blank line; a `data:` line in it makes it a change.
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (/^data:/m.test(event) && !stopped) onChange();
          }
        }
        retry("ended");
      } catch (e) {
        if (!stopped)
          retry(ctl.signal.aborted ? "went silent" : `failed (${(e as Error).message})`);
      } finally {
        clearTimeout(silence);
      }
    };

    void open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }
}
