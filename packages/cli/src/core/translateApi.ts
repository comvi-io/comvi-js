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
}

export type MtErrorType =
  | "insufficient_credits"
  | "provider_error"
  | "no_source"
  | "no_translation"
  | "unknown";

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

const JOB_STATES = new Set(["waiting", "active", "completed", "failed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

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
    typeof value.credits.exhausted === "boolean"
  );
}

export function isMtJobStatus(value: unknown): value is MtJobStatus {
  if (!isRecord(value) || typeof value.status !== "string" || !JOB_STATES.has(value.status)) {
    return false;
  }
  if (value.result === undefined) return true;
  const result = value.result;
  return (
    isRecord(result) &&
    isCount(result.processed) &&
    isCount(result.failed) &&
    (result.errors === undefined ||
      (Array.isArray(result.errors) &&
        result.errors.every(
          (error) =>
            isRecord(error) && typeof error.key === "string" && typeof error.message === "string",
        )))
  );
}

/** The in-flight jobs a 403 `LIMIT_EXCEEDED` from mt/fill carries in its meta. */
export function jobsInLimitMeta(meta: unknown): MtFillJob[] {
  return isRecord(meta) && Array.isArray(meta.jobs) ? meta.jobs.filter(isMtFillJob) : [];
}
