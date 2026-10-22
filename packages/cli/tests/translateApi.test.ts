import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMtFillResponse, isMtJobStatus, jobsInLimitMeta } from "../src/core/translateApi";

const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures/translate/contract.json"), "utf-8"),
) as {
  fill: Record<string, { status?: number; body: Record<string, unknown> }>;
  status: Record<string, { body: Record<string, unknown> }>;
};

/** A deep copy of `body` with the value at `path` replaced, or removed for `undefined`. */
function withValue(body: unknown, path: (string | number)[], value: unknown): unknown {
  const copy = structuredClone(body) as Record<string | number, unknown>;
  let node = copy;
  for (const step of path.slice(0, -1)) node = node[step] as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

describe("isMtFillResponse", () => {
  const valid = contract.fill.enqueued.body;

  it("accepts the contract's responses", () => {
    for (const name of ["enqueued", "dryRun", "nothingToDo"]) {
      expect(isMtFillResponse(contract.fill[name].body)).toBe(true);
    }
  });

  it.each<[string, (string | number)[], unknown]>([
    ["no jobs", ["jobs"], undefined],
    ["jobs not a list", ["jobs"], {}],
    ["a job without an id", ["jobs", 0, "jobId"], undefined],
    ["a job with an empty id", ["jobs", 0, "jobId"], ""],
    ["a job without a locale", ["jobs", 0, "targetLocaleCode"], 7],
    ["a job with a negative count", ["jobs", 0, "keyCount"], -1],
    ["a job with a count that is a string", ["jobs", 0, "keyCount"], "1"],
    ["a job without owned", ["jobs", 0, "owned"], "yes"],
    ["a job that is not an object", ["jobs", 0], "fill-1"],
    ["no pairs", ["pairs"], undefined],
    ["pairs as a list", ["pairs"], [1]],
    ["toTranslate missing", ["pairs", "toTranslate"], undefined],
    ["alreadyInFlight negative", ["pairs", "alreadyInFlight"], -2],
    ["alreadyTranslated a string", ["pairs", "alreadyTranslated"], "4"],
    ["noSource null", ["pairs", "noSource"], null],
    ["skippedLocales missing", ["skippedLocales"], undefined],
    ["a skipped locale without a code", ["skippedLocales", 0, "code"], undefined],
    ["a skipped locale without a reason", ["skippedLocales", 0, "reason"], 1],
    ["a skipped locale that is a string", ["skippedLocales", 0], "ja"],
    ["no estimate", ["estimate"], undefined],
    ["estimate credits missing", ["estimate", "credits"], undefined],
    ["estimate approximate a string", ["estimate", "approximate"], "no"],
    ["no credits", ["credits"], undefined],
    ["credits exhausted missing", ["credits", "exhausted"], undefined],
  ])("refuses %s", (_what, path, value) => {
    expect(isMtFillResponse(withValue(valid, path, value))).toBe(false);
  });

  it.each([null, [], "ok", 202])("refuses %j", (body) => {
    expect(isMtFillResponse(body)).toBe(false);
  });

  it("accepts failedLocales when present, and refuses a malformed one", () => {
    const failed = [{ targetLocaleCode: "uk", reason: "enqueue_failed" }];
    expect(isMtFillResponse({ ...valid, failedLocales: failed })).toBe(true);
    expect(isMtFillResponse({ ...valid, failedLocales: [] })).toBe(true);
    expect(isMtFillResponse({ ...valid, failedLocales: "uk" })).toBe(false);
    expect(isMtFillResponse({ ...valid, failedLocales: [{ reason: "x" }] })).toBe(false);
    expect(isMtFillResponse({ ...valid, failedLocales: [{ targetLocaleCode: "uk" }] })).toBe(false);
    expect(isMtFillResponse({ ...valid, failedLocales: ["uk"] })).toBe(false);
  });

  it("counts Infinity as no count", () => {
    expect(isMtFillResponse(withValue(valid, ["pairs", "toTranslate"], Infinity))).toBe(false);
  });
});

describe("isMtJobStatus", () => {
  it("accepts the contract's statuses", () => {
    for (const name of ["waiting", "active", "completed", "completedWithErrors", "failed"]) {
      const body = contract.status[name].body;
      expect(isMtJobStatus(body, body.jobId as string)).toBe(true);
    }
  });

  const completed = contract.status.completedWithErrors.body;
  const JOB = completed.jobId as string;

  it.each<[string, (string | number)[], unknown]>([
    ["an unknown state", ["status"], "paused"],
    ["no state", ["status"], undefined],
    ["a result that is not an object", ["result"], "done"],
    ["a result without processed", ["result", "processed"], undefined],
    ["a result with a negative failed", ["result", "failed"], -1],
    ["errors that are not a list", ["result", "errors"], {}],
    ["an error without a key", ["result", "errors", 0, "key"], undefined],
    ["an error without a message", ["result", "errors", 0, "message"], 3],
    ["an error that is a string", ["result", "errors", 0], "boom"],
    ["another job's status", ["jobId"], "fill-123-de-other"],
    ["no job id", ["jobId"], undefined],
    ["a negative progress", ["progress"], -5],
    ["a progress that is a string", ["progress"], "50"],
    ["an error reason that is not a string", ["error"], 500],
    ["alreadyTranslated that is not a count", ["result", "alreadyTranslated"], "0"],
    ["skippedFilledMeanwhile negative", ["result", "skippedFilledMeanwhile"], -1],
    ["an error type outside the union", ["result", "errors", 0, "type"], "quota"],
  ])("refuses %s", (_what, path, value) => {
    expect(isMtJobStatus(withValue(completed, path, value), JOB)).toBe(false);
  });

  it.each(["waiting", "active", "completed", "failed"])("accepts the state %s", (state) => {
    expect(isMtJobStatus({ jobId: "j", status: state }, "j")).toBe(true);
  });

  it.each(["insufficient_credits", "provider_error", "no_source", "no_translation", "unknown"])(
    "accepts the error type %s, and an error without a type",
    (type) => {
      expect(isMtJobStatus(withValue(completed, ["result", "errors", 0, "type"], type), JOB)).toBe(
        true,
      );
      expect(
        isMtJobStatus(withValue(completed, ["result", "errors", 0, "type"], undefined), JOB),
      ).toBe(true);
    },
  );

  it("accepts a result without errors", () => {
    expect(isMtJobStatus(withValue(completed, ["result", "errors"], undefined), JOB)).toBe(true);
  });

  it.each([null, [], "completed"])("refuses %j", (body) => {
    expect(isMtJobStatus(body, JOB)).toBe(false);
  });
});

describe("jobsInLimitMeta", () => {
  it("reads the jobs of a LIMIT_EXCEEDED meta, dropping malformed ones", () => {
    const job = { jobId: "j", targetLocaleCode: "de", keyCount: 1, owned: false };
    expect(jobsInLimitMeta({ jobs: [job, { jobId: "x" }] })).toEqual([job]);
  });

  it.each([undefined, null, [], { jobs: "j" }, {}])("finds no jobs in %j", (meta) => {
    expect(jobsInLimitMeta(meta)).toEqual([]);
  });
});

/** The platform's own fixture (lot P3), copied as it is. */
const platform = JSON.parse(
  readFileSync(join(__dirname, "fixtures/translate/platform-contract.json"), "utf-8"),
) as {
  fill: Record<string, { status: number; body: Record<string, unknown> }>;
  jobStatus: Record<string, { status: number; body: Record<string, unknown> }>;
};

/** Keys at every level and value types; arrays by their first element, as P3 checks them. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? [shape(value[0])] : [];
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    );
  }
  return value === null ? "null" : typeof value;
}

describe("the platform's contract fixture", () => {
  it("passes the CLI's checks: every fill body and every job status", () => {
    expect(isMtFillResponse(platform.fill.queued.body)).toBe(true);
    expect(isMtFillResponse(platform.fill.nothingNew.body)).toBe(true);
    for (const status of Object.values(platform.jobStatus)) {
      expect(isMtJobStatus(status.body, status.body.jobId as string)).toBe(true);
    }
    expect(jobsInLimitMeta(platform.fill.creditsExhausted.body.meta)).toHaveLength(1);
  });

  it.each([
    ["queued", "enqueued"],
    ["nothingNew", "nothingNewInFlight"],
    ["creditsExhausted", "creditsExhausted"],
    ["overLimit", "overLimit"],
  ])("fill %s has the shape of the CLI's mock %s", (platformName, mockName) => {
    expect(contract.fill[mockName].status ?? 200).toBe(platform.fill[platformName].status);
    expect(shape(contract.fill[mockName].body)).toEqual(shape(platform.fill[platformName].body));
  });

  it.each([
    ["waiting", "waiting"],
    ["completed", "completedWithErrors"],
  ])("job status %s has the shape of the CLI's mock %s", (platformName, mockName) => {
    expect(shape(contract.status[mockName].body)).toEqual(
      shape(platform.jobStatus[platformName].body),
    );
  });
});
