/**
 * The context collector as the platform sees it: requests under
 * `/v1/context/`. Lets real-runtime suites assert whether collection ran, and
 * with which screen group, without reaching into the Core or the Collector.
 */

/** A 200 the collector accepts for either of its two endpoints. */
export async function contextApiResponse(path: string): Promise<Response> {
  const body = path.includes("/v1/context/handshake")
    ? { entries: [] }
    : { updated: [], resend: [], orphanObservations: 0, hashSkew: 0 };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

type RecordedCall = readonly [input: unknown, init?: RequestInit];

function pathOf(input: unknown): string {
  const raw = input instanceof Request ? input.url : String(input);
  return raw.startsWith("/") ? raw : new URL(raw).pathname;
}

/** The `/v1/context/*` paths among recorded fetch or transport calls, in order. */
export function contextPaths(calls: readonly RecordedCall[]): string[] {
  return calls.map(([input]) => pathOf(input)).filter((path) => path.startsWith("/v1/context/"));
}

/** The screen group of every item the collector reported in its usages posts. */
export function reportedScreenGroups(calls: readonly RecordedCall[]): string[] {
  return calls
    .filter(([input]) => pathOf(input) === "/v1/context/usages")
    .flatMap(([, init]) => {
      const body = JSON.parse(String(init?.body)) as { items: Array<{ screenGroup: string }> };
      return body.items.map((item) => item.screenGroup);
    });
}
