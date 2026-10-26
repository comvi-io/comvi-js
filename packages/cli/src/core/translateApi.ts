/**
 * The platform contract `comvi translate` speaks, in one place:
 *
 * - `POST /v1/projects/:projectId/mt/fill` enqueues MT for the key × locale
 *   pairs whose target is missing (or, with `dryRun`, only counts them).
 * - `GET /v1/projects/:projectId/keys/batch/mt/:jobId/status` reports one job.
 *
 * Every shape the CLI reads is checked here, so a platform that answers
 * something else is an invalid response (exit 2), never a crash.
 */

export interface MtFillRequest {
  targetLocaleCodes?: string[];
  namespaces?: string[];
  keyIds?: number[];
  /** Compared with `pairs.toTranslate`; left out for no limit. */
  maxPairs?: number;
  dryRun?: boolean;
}

export interface MtFillJob {
  jobId: string;
  targetLocaleCode: string;
  keyCount: number;
  /** False for a job another run or auto-MT after import already started. */
  owned: boolean;
}

export interface MtFillPairs {
  toTranslate: number;
  alreadyInFlight: number;
  alreadyTranslated: number;
  noSource: number;
}

export interface MtFillResponse {
  jobs: MtFillJob[];
  pairs: MtFillPairs;
  skippedLocales: Array<{ code: string; reason: string }>;
  estimate: { credits: number; approximate: boolean };
  credits: { exhausted: boolean };
  /** Locales whose job could not be queued; absent on older platforms. */
  failedLocales?: Array<{ targetLocaleCode: string; reason: string }>;
}

export type MtErrorType =
  "insufficient_credits" | "provider_error" | "no_source" | "no_translation" | "unknown";

export interface MtJobError {
  keyId: number;
  key: string;
  message: string;
  /** Absent on a platform that predates typed errors; read as `unknown`. */
  type?: MtErrorType;
}

export interface MtJobStatus {
  jobId: string;
  status: "waiting" | "active" | "completed" | "failed";
  progress?: number;
  result?: {
    processed: number;
    failed: number;
    alreadyTranslated?: number;
    skippedFilledMeanwhile?: number;
    errors?: MtJobError[];
  };
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  // Number.isFinite never coerces: a string is not finite.
  return Number.isFinite(value) && (value as number) >= 0;
}

export function isMtFillJob(value: unknown): value is MtFillJob {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    value.jobId !== "" &&
    typeof value.targetLocaleCode === "string" &&
    isCount(value.keyCount) &&
    typeof value.owned === "boolean"
  );
}

export function isMtFillResponse(value: unknown): value is MtFillResponse {
  if (!isRecord(value) || !isRecord(value.pairs) || !isRecord(value.estimate)) return false;
  const { pairs, estimate } = value;
  return (
    Array.isArray(value.jobs) &&
    value.jobs.every(isMtFillJob) &&
    isCount(pairs.toTranslate) &&
    isCount(pairs.alreadyInFlight) &&
    isCount(pairs.alreadyTranslated) &&
    isCount(pairs.noSource) &&
    Array.isArray(value.skippedLocales) &&
    value.skippedLocales.every(
      (skipped) =>
        isRecord(skipped) && typeof skipped.code === "string" && typeof skipped.reason === "string",
    ) &&
    isCount(estimate.credits) &&
    typeof estimate.approximate === "boolean" &&
    isRecord(value.credits) &&
    typeof value.credits.exhausted === "boolean" &&
    (value.failedLocales === undefined ||
      (Array.isArray(value.failedLocales) &&
        value.failedLocales.every(
          (failed) =>
            isRecord(failed) &&
            typeof failed.targetLocaleCode === "string" &&
            typeof failed.reason === "string",
        )))
  );
}

/** An optional field is absent, or a count. */
function isOptionalCount(value: unknown): boolean {
  return value === undefined || isCount(value);
}

function isMtJobError(value: unknown): value is MtJobError {
  const types: unknown[] = [
    "insufficient_credits",
    "provider_error",
    "no_source",
    "no_translation",
    "unknown",
  ];
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.message === "string" &&
    (value.type === undefined || types.includes(value.type))
  );
}

/**
 * The status of the job `jobId`: every field the CLI reads is checked when it
 * is there, and the job is the one that was asked for.
 */
export function isMtJobStatus(value: unknown, jobId: string): value is MtJobStatus {
  const states: unknown[] = ["waiting", "active", "completed", "failed"];
  if (
    !isRecord(value) ||
    value.jobId !== jobId ||
    !states.includes(value.status) ||
    !isOptionalCount(value.progress) ||
    (value.error !== undefined && typeof value.error !== "string")
  ) {
    return false;
  }
  if (value.result === undefined) return true;
  const result = value.result;
  return (
    isRecord(result) &&
    isCount(result.processed) &&
    isCount(result.failed) &&
    isOptionalCount(result.alreadyTranslated) &&
    isOptionalCount(result.skippedFilledMeanwhile) &&
    (result.errors === undefined ||
      (Array.isArray(result.errors) && result.errors.every(isMtJobError)))
  );
}

/** The in-flight jobs a 403 `LIMIT_EXCEEDED` from mt/fill carries in its meta. */
export function jobsInLimitMeta(meta: unknown): MtFillJob[] {
  return isRecord(meta) && Array.isArray(meta.jobs) ? meta.jobs.filter(isMtFillJob) : [];
}
