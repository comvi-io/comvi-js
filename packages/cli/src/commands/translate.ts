import { Command } from "commander";
import { ConfigLoader } from "../core/ConfigLoader";
import { timeoutsFromEnv } from "../core/timeouts";
import { ApiClient } from "../core/ApiClient";
import { TranslationSync } from "../core/TranslationSync";
import { assertMergePaths, mergeMissing, type MergeReport } from "../core/MissingMerge";
import {
  jobsInLimitMeta,
  type MtFillJob,
  type MtFillRequest,
  type MtFillResponse,
  type MtJobStatus,
} from "../core/translateApi";
import {
  DEFAULT_FILE_TEMPLATE,
  DEFAULT_TRANSLATIONS_PATH,
  isDefaultFileTemplate,
} from "../defaults";
import type { ForceMode, TranslationData, TranslationsResponse } from "../types";
import {
  ErrorCodes,
  EXIT_ACCESS,
  EXIT_FAILURE,
  EXIT_UNAVAILABLE,
  exitCodeFor,
  TypegenError,
} from "../utils/errors";
import { hasOwnKey } from "../utils/dictionary";
import { parseListFlag, resolveFilter } from "../utils/filterResolution";
import { findLocale, localeKey } from "../utils/locales";
import { runPush, type PushRunResult } from "./push";

interface TranslateOptions {
  config?: string;
  locale?: string;
  ns?: string;
  push: boolean;
  forceMode?: string;
  maxKeys: string;
  dryRun?: boolean;
  timeout: string;
  format: string;
}

/** The shared request budget for job status: at most one every 2 s, backing off to 10 s. */
const POLL_MIN_MS = 2_000;
const POLL_MAX_MS = 10_000;
/** Error lines printed before "… and N more". */
const LISTED_ERRORS = 20;

const UNFINISHED_MESSAGE = "Jobs keep running; run `comvi translate` again or `comvi pull`.";
const RUN_AGAIN_MESSAGE = "Some values are still empty; run `comvi translate` again.";
/** Keys named in the "not on the platform" warning before "… and N more". */
const LISTED_KEYS = 10;
const TOP_UP_MESSAGE =
  "Top up machine translation credits, then run `comvi translate` again to finish the rest.";

export function createTranslateCommand(): Command {
  return new Command("translate")
    .description("Machine-translate missing values on the platform and write them to local files")
    .option("-c, --config <path>", "Path to .comvirc.json file")
    .option("-l, --locale <locales>", "Target locales (comma-separated)")
    .option("-n, --ns <namespaces>", "Filter by namespaces (comma-separated)")
    .option("--no-push", "Do not push local files first")
    .option(
      "--force-mode <mode>",
      "Conflict resolution for the push: override, keep, ask, abort (default: ask)",
    )
    .option("--max-keys <n>", "Most key × locale pairs to translate; 0 for no limit", "1000")
    .option("--dry-run", "Count what would be translated; push, translate and write nothing")
    .option("--timeout <duration>", "How long to wait for the jobs, e.g. 90s, 20m, 1h", "20m")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (options: TranslateOptions) => {
      process.exit(await runTranslate(options));
    });
}

/** One exit code for everything a run collected. Precedence: 3 > 1 > 2 > 0. */
export function reduceExitCode(outcomes: readonly number[]): number {
  for (const code of [EXIT_ACCESS, EXIT_FAILURE, EXIT_UNAVAILABLE]) {
    if (outcomes.includes(code)) return code;
  }
  return 0;
}

interface RunError {
  type: string;
  message: string;
  jobId?: string;
  locale?: string;
  key?: string;
}

interface JobTrack {
  job: MtFillJob;
  state: "pending" | "completed" | "failed" | "gone" | "error" | "unverifiable" | "running";
  status?: MtJobStatus;
  error?: unknown;
}

const inputError = (message: string) => new TypegenError(message, ErrorCodes.VALIDATION_FAILED);

async function runTranslate(options: TranslateOptions): Promise<number> {
  const json = options.format === "json";
  const say = (line: string) => (json ? console.error(line) : console.log(line));

  const fatal = (error: unknown): number => {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      console.log(
        JSON.stringify(
          {
            version: 1,
            pairs: null,
            jobs: [],
            written: false,
            errors: [{ type: "fatal", message }],
            skippedLocales: [],
            ok: false,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`✗ Translate failed: ${message}`);
    }
    return exitCodeFor(error);
  };

  let setup: Awaited<ReturnType<typeof prepare>>;
  try {
    setup = await prepare(options, say);
  } catch (error) {
    return fatal(error);
  }
  const { api, config, forceMode, maxPairs, timeoutMs, targets, namespaces, source } = setup;
  const scope: MtFillRequest = {
    ...(targets ? { targetLocaleCodes: targets } : {}),
    ...(namespaces ? { namespaces } : {}),
  };
  const pushOptions = {
    // The source goes with any locale filter: the new keys are in it.
    locale: targets ? [...targets, source].join(",") : undefined,
    ns: namespaces?.join(","),
    forceMode,
    allowEmpty: true,
  };
  const pushDeps = { config, apiClient: api, log: say };

  if (options.dryRun) {
    try {
      // With the push on, namespaces only the push would create are not on
      // the platform yet: count over every namespace, as the preflight does.
      const preview = await api.fillMissing({
        dryRun: true,
        ...(targets ? { targetLocaleCodes: targets } : {}),
        ...(namespaces && !options.push ? { namespaces } : {}),
      });
      let pushed: number | undefined;
      if (options.push) {
        const result = await runPush({ ...pushOptions, dryRun: true }, pushDeps);
        pushed = pairsPushWouldAdd(result, source, targets, forceMode);
      }
      return reportDryRun(preview, pushed, maxPairs, json, say);
    } catch (error) {
      return fatal(error);
    }
  }

  const outcomes: number[] = [];
  const errors: RunError[] = [];
  let jobs: MtFillJob[];
  let fill: MtFillResponse | undefined;
  try {
    if (options.push) {
      // Read-only, before anything is written: an old platform, a key
      // without mt:use or a forbidden locale stops the run before the push.
      await api.fillMissing({ dryRun: true, ...(targets ? { targetLocaleCodes: targets } : {}) });
      await runPush({ ...pushOptions, scheduleAutoMt: false }, pushDeps);
    }
    say("🔄 Requesting machine translation...");
    try {
      // No limit is no `maxPairs`: JSON leaves an undefined field out.
      fill = await api.fillMissing({ ...scope, maxPairs });
      jobs = fill.jobs;
    } catch (error) {
      const code = error instanceof TypegenError ? error.details?.code : undefined;
      if (code === "MT_FILL_LIMIT") throw overLimit(error as TypegenError, maxPairs);
      if (code !== "LIMIT_EXCEEDED") throw error;
      // Out of credits: nothing new starts, but the jobs in flight are collected.
      jobs = jobsInLimitMeta((error as TypegenError).details?.meta);
      outcomes.push(EXIT_ACCESS);
      errors.push({ type: "limit_exceeded", message: (error as TypegenError).message });
    }
  } catch (error) {
    return fatal(error);
  }

  // Locales the platform could not queue: what was queued still runs.
  const failedLocales = fill?.failedLocales ?? [];
  for (const failed of failedLocales) {
    outcomes.push(EXIT_FAILURE);
    errors.push({
      type: "enqueue_failed",
      message: `${failed.targetLocaleCode}: could not be queued (${failed.reason})`,
      locale: failed.targetLocaleCode,
    });
  }

  const tracks: JobTrack[] = jobs.map((job) => ({ job, state: "pending" }));
  if (tracks.length > 0) {
    say(`⏳ Waiting for ${tracks.length} ${tracks.length === 1 ? "job" : "jobs"}...`);
    await pollJobs(api, tracks, timeoutMs);
  }

  const pairs = {
    toTranslate: fill?.pairs.toTranslate ?? 0,
    alreadyInFlight: fill?.pairs.alreadyInFlight ?? 0,
    alreadyTranslated: fill?.pairs.alreadyTranslated ?? 0,
    noSource: fill?.pairs.noSource ?? 0,
    translated: 0,
    filledMeanwhile: 0,
    failed: 0,
    unfinished: 0,
    unverifiable: 0,
    notOnPlatform: 0,
  };
  let creditsOut = outcomes.includes(EXIT_ACCESS);

  for (const track of tracks) {
    const { job } = track;
    const label = `job ${job.jobId}${job.owned ? "" : ", not started by this run"}`;
    const where = { jobId: job.jobId, locale: job.targetLocaleCode };
    switch (track.state) {
      case "completed": {
        const result = track.status?.result;
        pairs.translated += result?.processed ?? 0;
        pairs.filledMeanwhile += result?.skippedFilledMeanwhile ?? 0;
        pairs.alreadyTranslated += result?.alreadyTranslated ?? 0;
        for (const keyError of result?.errors ?? []) {
          const type = keyError.type ?? "unknown";
          if (type === "no_source") {
            pairs.noSource++;
            continue;
          }
          pairs.failed++;
          if (type === "insufficient_credits") {
            outcomes.push(EXIT_ACCESS);
            creditsOut = true;
          } else {
            outcomes.push(EXIT_FAILURE);
          }
          errors.push({
            type,
            message: `${job.targetLocaleCode}: ${keyError.key} — ${keyError.message} (${type})`,
            ...where,
            key: keyError.key,
          });
        }
        break;
      }
      case "failed":
        outcomes.push(EXIT_FAILURE);
        errors.push({
          type: "job_failed",
          message: `${job.targetLocaleCode}: ${label} failed: ${track.status?.error ?? "no reason given"}`,
          ...where,
        });
        break;
      case "unverifiable": {
        // The platform answered something that is not a status: whether the
        // job worked cannot be told, which is not a confirmed failure.
        outcomes.push(EXIT_UNAVAILABLE);
        const reason = track.error instanceof Error ? track.error.message : String(track.error);
        errors.push({
          type: "status_invalid",
          message: `${job.targetLocaleCode}: ${label}: ${reason}`,
          ...where,
        });
        break;
      }
      case "error": {
        // Transient failures are retried while polling, so this one is final.
        outcomes.push(exitCodeFor(track.error) === EXIT_ACCESS ? EXIT_ACCESS : EXIT_FAILURE);
        const reason = track.error instanceof Error ? track.error.message : String(track.error);
        errors.push({
          type: "status_failed",
          message: `${job.targetLocaleCode}: ${label}: ${reason}`,
          ...where,
        });
        break;
      }
      // "running" and "gone" are judged per locale after the fetch, from
      // what is still empty.
    }
  }

  say("🔄 Fetching translations from TMS...");
  let remote: TranslationsResponse | undefined;
  try {
    // The source comes too: a still-empty target counts only where the
    // platform has its source.
    remote = await api.fetchTranslations({
      locales: targets ? [...targets, source] : undefined,
      namespaces,
    });
  } catch (error) {
    outcomes.push(exitCodeFor(error) === EXIT_ACCESS ? EXIT_ACCESS : EXIT_UNAVAILABLE);
    const reason = error instanceof Error ? error.message : String(error);
    errors.push({ type: "fetch_failed", message: `${reason}. Nothing was written.` });
  }

  let merged: MergeReport | undefined;
  // Filled as the merge goes: what was judged and written survives a throw.
  const judged: MergeReport = { files: [], errors: [] };
  if (remote) {
    say("📝 Writing missing values...");
    try {
      merged = await writeMissing(setup, remote, judged);
    } catch (error) {
      outcomes.push(EXIT_FAILURE);
      const reason = error instanceof Error ? error.message : String(error);
      const count = judged.files.filter((file) => file.filled.length > 0).length;
      errors.push({
        type: "write_failed",
        message:
          count === 0
            ? `${reason}. Nothing was written.`
            : `Writing stopped: ${reason}. ${count} ${count === 1 ? "file was" : "files were"} already written.`,
      });
    }
  }
  for (const file of merged?.files ?? []) {
    for (const key of file.collisions) {
      outcomes.push(EXIT_FAILURE);
      errors.push({
        type: "collision",
        message: `${file.filePath}: "${key}" does not fit the file's structure; not written`,
        locale: file.locale,
        key,
      });
    }
  }
  for (const failure of merged?.errors ?? []) {
    outcomes.push(EXIT_FAILURE);
    errors.push({
      type: "write_failed",
      message: `${failure.filePath ?? `${failure.locale}/${failure.namespace}`}: ${failure.message}`,
      locale: failure.locale,
    });
  }

  // What is still empty, per locale: unfinished while a job for the locale
  // runs (exit 2), else unfinished for good (exit 1). Keys whose source is not
  // on the platform were never translatable: push first.
  const anyIn = (state: JobTrack["state"], locale: string) =>
    tracks.some(
      (track) =>
        track.state === state && localeKey(track.job.targetLocaleCode) === localeKey(locale),
    );
  let stillRunning = !merged && tracks.some((track) => track.state === "running");
  let runAgain = false;
  const notOnPlatform: string[] = [];
  if (merged && remote) {
    const remoteSource = catalogOf(remote.translations, source);
    const skipped = new Set((fill?.skippedLocales ?? []).map((s) => localeKey(s.code)));
    const notQueued = new Set(failedLocales.map((f) => localeKey(f.targetLocaleCode)));
    const leftover = new Map<string, { locale: string; keys: Set<string> }>();
    for (const file of merged.files) {
      if (skipped.has(localeKey(file.locale))) continue;
      const entry = leftover.get(localeKey(file.locale)) ?? {
        locale: file.locale,
        keys: new Set(),
      };
      leftover.set(localeKey(file.locale), entry);
      const sourceCatalog = remoteSource?.[file.namespace];
      for (const key of file.missing) {
        if (sourceCatalog && hasOwnKey(sourceCatalog, key) && sourceCatalog[key] !== "") {
          entry.keys.add(`${file.namespace}\u0000${key}`);
        } else {
          notOnPlatform.push(`${file.locale}: ${key}`);
        }
      }
    }
    for (const { locale, keys } of leftover.values()) {
      if (keys.size === 0) continue;
      const values = `${keys.size} ${keys.size === 1 ? "value is" : "values are"} still empty`;
      if (notQueued.has(localeKey(locale))) {
        // Already an error of its own: the locale was never queued.
        pairs.unfinished += keys.size;
      } else if (anyIn("running", locale)) {
        pairs.unfinished += keys.size;
        stillRunning = true;
        outcomes.push(EXIT_UNAVAILABLE);
        errors.push({
          type: "unfinished_running",
          message: `${locale}: ${values}; its jobs are still running`,
          locale,
        });
      } else if (anyIn("unverifiable", locale)) {
        // Its job already counts exit 2: the status could not be read.
        pairs.unverifiable += keys.size;
        errors.push({
          type: "unverifiable",
          message: `${locale}: ${values}; its job's status could not be read`,
          locale,
        });
      } else {
        pairs.unfinished += keys.size;
        runAgain = true;
        outcomes.push(EXIT_FAILURE);
        errors.push({
          type: "unfinished",
          message: `${locale}: ${values} after its jobs ended`,
          locale,
        });
      }
    }
    pairs.notOnPlatform = notOnPlatform.length;
  }

  // `written` is the files actually on disk, whatever else failed: false only
  // when none was written. `differ` counts the kept local values that differ
  // from the platform over every file judged, written or not.
  const writtenFiles = judged.files.filter((file) => file.filled.length > 0);
  const differ = judged.files.reduce((sum, file) => sum + file.differ.length, 0);
  const written =
    writtenFiles.length > 0
      ? {
          files: writtenFiles.length,
          values: writtenFiles.reduce((sum, file) => sum + file.filled.length, 0),
          differ,
        }
      : false;

  const exitCode = reduceExitCode(outcomes);

  if (json) {
    console.log(
      JSON.stringify(
        {
          version: 1,
          pairs,
          jobs: tracks.map(({ job, state, status }) => ({
            ...job,
            status: state,
            ...(status?.result
              ? { processed: status.result.processed, failed: status.result.failed }
              : {}),
          })),
          written,
          errors,
          skippedLocales: fill?.skippedLocales ?? [],
          ok: exitCode === 0,
        },
        null,
        2,
      ),
    );
  }

  if (fill && fill.skippedLocales.length > 0) {
    console.error(
      `⚠  Skipped locales: ${fill.skippedLocales.map((s) => `${s.code} (${s.reason})`).join(", ")}`,
    );
  }
  for (const error of errors.slice(0, LISTED_ERRORS)) {
    console.error(`✗ ${error.message}`);
  }
  if (errors.length > LISTED_ERRORS) {
    console.error(`  … and ${errors.length - LISTED_ERRORS} more`);
  }

  say(exitCode === 0 ? "\n✓ Translate complete!" : "\n⚠  Translate finished with problems");
  say(
    `  Pairs: ${pairs.translated} translated, ${pairs.alreadyInFlight} already in flight, ` +
      `${pairs.filledMeanwhile} filled meanwhile, ${pairs.noSource} no source, ` +
      `${pairs.alreadyTranslated} already translated, ${pairs.failed} failed`,
  );
  if (written) {
    say(
      `  Files changed: ${written.files} (${written.values} ${written.values === 1 ? "value" : "values"})`,
    );
  }
  if (differ > 0) {
    say(
      `  ${differ} ${differ === 1 ? "differs" : "differ"} from the platform; ` +
        `\`comvi pull\` will update ${differ === 1 ? "it" : "them"}.`,
    );
  }
  if (notOnPlatform.length > 0) {
    const more =
      notOnPlatform.length > LISTED_KEYS
        ? `, … and ${notOnPlatform.length - LISTED_KEYS} more`
        : "";
    console.error(
      `⚠  ${notOnPlatform.length} empty ${notOnPlatform.length === 1 ? "value has" : "values have"} ` +
        `no source on the platform; push first: ${notOnPlatform.slice(0, LISTED_KEYS).join(", ")}${more}`,
    );
  }
  if (creditsOut) {
    console.error(`⚠  ${TOP_UP_MESSAGE}`);
  }
  if (fill?.credits.exhausted && !creditsOut) {
    console.error("⚠  Machine translation credits are used up; jobs already in flight may stop.");
  }
  if (failedLocales.length > 0) {
    const count = failedLocales.length;
    console.error(
      `⚠  ${count} ${count === 1 ? "locale" : "locales"} could not be queued; run \`comvi translate\` again.`,
    );
  }
  if (stillRunning) {
    say(UNFINISHED_MESSAGE);
  } else if (runAgain) {
    say(RUN_AGAIN_MESSAGE);
  }

  return exitCode;
}

/** Flags, configuration and the project, before anything is pushed or translated. */
async function prepare(options: TranslateOptions, say: (line: string) => void) {
  if (options.format !== "text" && options.format !== "json") {
    throw inputError(`Invalid --format: ${options.format}. Use: text or json`);
  }
  const maxPairs = parseMaxKeys(options.maxKeys);
  const timeoutMs = parseDuration(options.timeout);

  say("🔄 Loading configuration...");
  // ConfigLoader.load() refuses a configuration without an API key.
  const config = await ConfigLoader.load(options.config);

  const forceMode = (options.forceMode || config.push?.forceMode || "ask") as ForceMode;
  if (!["override", "keep", "ask", "abort"].includes(forceMode)) {
    throw inputError(`Invalid force-mode: ${forceMode}. Use: override, keep, ask, or abort`);
  }
  if (options.format === "json" && forceMode === "ask" && options.push && !options.dryRun) {
    throw inputError(
      "--format json cannot answer the conflict prompt of --force-mode ask, the default. " +
        "Pass --force-mode override, keep or abort, or --no-push.",
    );
  }

  const locs = resolveFilter(parseListFlag(options.locale, "--locale"), config.locales);
  const nss = resolveFilter(parseListFlag(options.ns, "--ns"), config.namespaces);
  if (locs.source === "config") {
    say(`📄 Using locales from .comvirc.json: ${locs.value!.join(", ")}`);
  }
  if (nss.source === "config") {
    say(`📄 Using namespaces from .comvirc.json: ${nss.value!.join(", ")}`);
  }

  const api = new ApiClient({
    apiKey: config.apiKey ?? "",
    apiBaseUrl: config.apiBaseUrl || "https://api.comvi.io",
    ...timeoutsFromEnv(),
  });
  const fileTemplate = config.fileTemplate || DEFAULT_FILE_TEMPLATE;
  const sync = new TranslationSync({
    translationsPath: config.translationsPath || DEFAULT_TRANSLATIONS_PATH,
    fileTemplate,
    format: config.format || "json",
  });

  const project = await api.validateApiKey();
  const source = project.sourceLocale || config.sourceLocale;
  if (!source) {
    throw new TypegenError(
      "The platform did not name the project's source locale",
      ErrorCodes.API_INVALID_RESPONSE,
    );
  }

  // Targets in the project's spelling (`-l pt_br` asks for pt-BR); the
  // source is never a target.
  let targets: string[] | undefined;
  const projectLocales = await api.fetchProjectLocales();
  if (locs.value) {
    // One entry per locale: `-l pt_br,pt-BR` is pt-BR once.
    const resolved = locs.value
      .map((locale) => findLocale(locale, projectLocales ?? []) ?? locale)
      .filter((locale) => localeKey(locale) !== localeKey(source));
    targets = [...new Map(resolved.map((locale) => [localeKey(locale), locale])).values()];
    if (targets.length === 0) {
      throw inputError(`--locale names only the source locale ${source}: nothing to translate`);
    }
  }

  // Without -l the targets are the project's locales. A platform that cannot
  // list them predates mt/fill too, and the files to write cannot be judged.
  if (!targets && projectLocales === undefined) {
    throw new TypegenError(
      "The platform does not support comvi translate: it cannot list the project's locales.",
      ErrorCodes.API_UNSUPPORTED,
    );
  }

  const defaultNamespace = isDefaultFileTemplate(fileTemplate)
    ? await api.fetchDefaultNamespace()
    : undefined;

  // The keys to fill come from the local source catalog; a broken file stops
  // the run here, before any MT.
  const local = await sync.readTranslations({
    locales: [source],
    namespaces: nss.value,
    defaultNamespace,
  });
  // Only the source was read: any file found is its catalog.
  const sourceLocale = local.locales[0];

  // Every file the run may write is judged now, before any push or MT: two
  // catalogs in one file, or a path out of the tree, exits 4 here.
  // projectLocales is known whenever -l is not given (checked above).
  const planned = targets ?? projectLocales!.filter((l) => localeKey(l) !== localeKey(source));
  if (sourceLocale !== undefined) {
    await assertMergePaths(
      sync,
      defaultNamespace,
      sourceLocale,
      Object.keys(local.translations[sourceLocale]),
      await localSpellings(sync, defaultNamespace, planned),
    );
  }

  return {
    api,
    config,
    sync,
    forceMode,
    maxPairs,
    timeoutMs,
    targets,
    namespaces: nss.value,
    source,
    defaultNamespace,
    localSource:
      sourceLocale === undefined
        ? undefined
        : { locale: sourceLocale, catalog: local.translations[sourceLocale] },
  };
}

/** `--max-keys`: a whole number; 0 is no limit (`undefined`). */
function parseMaxKeys(raw: string): number | undefined {
  // At most 15 digits, so every value is a safe integer.
  if (!/^\d{1,15}$/.test(raw)) {
    throw inputError(`Invalid --max-keys: ${raw}. Use a whole number; 0 for no limit`);
  }
  const value = Number(raw);
  return value === 0 ? undefined : value;
}

const DURATION_UNITS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

/** `--timeout`: `90s`, `20m`, `1h`, `500ms`; a bare number is seconds. */
function parseDuration(raw: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(raw);
  const value = match ? Number(match[1]) * DURATION_UNITS[match[2] ?? "s"] : NaN;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw inputError(`Invalid --timeout: ${raw}. Use a duration such as 90s, 20m or 1h`);
  }
  return value;
}

function overLimit(error: TypegenError, maxPairs: number | undefined): TypegenError {
  const meta = error.details?.meta as
    | { pairs?: { toTranslate?: unknown }; estimate?: { credits?: unknown } }
    | undefined;
  const count = meta?.pairs?.toTranslate;
  const credits = meta?.estimate?.credits;
  const counted =
    typeof count === "number"
      ? `${count} key × locale pairs to translate` +
        (typeof credits === "number" ? ` (≈${credits} credits)` : "")
      : "More key × locale pairs to translate";
  const limit = maxPairs === undefined ? "the platform's limit" : `--max-keys ${maxPairs}`;
  return new TypegenError(
    `${counted}, over ${limit}. No machine translation was started. ` +
      "Raise --max-keys, narrow the run with --locale or --ns, or pass --max-keys 0 for no limit.",
    error.code,
    error,
    error.details,
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll every job, own and foreign, from one request budget: at least
 * POLL_MIN_MS between two status requests of the run, growing to POLL_MAX_MS
 * while nothing changes and back to the minimum when a job ends. A job whose
 * status is 404 is gone and no longer asked about. At the deadline the jobs
 * still pending are left `running`.
 */
async function pollJobs(api: ApiClient, tracks: JobTrack[], timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pending = [...tracks];
  const progress = process.stderr.isTTY
    ? () =>
        process.stderr.write(`\r⏳ ${tracks.length - pending.length}/${tracks.length} jobs done`)
    : () => undefined;
  let interval = POLL_MIN_MS;
  let last = Date.now();
  let notBefore = 0;
  let turn = 0;

  while (pending.length > 0) {
    // Never sleeps past the deadline, and a request needs budget left: none
    // starts at or after it.
    // A 429's Retry-After holds back the next request; the deadline still rules.
    await sleep(Math.min(Math.max(last + interval, notBefore), deadline) - Date.now());
    last = Date.now();
    if (last >= deadline) break;

    turn %= pending.length;
    const track = pending[turn];
    let ended = false;
    let progressed = false;
    try {
      // The request may take no longer than what is left of the run's budget.
      const status = await api.getMtJobStatus(track.job.jobId, { timeoutMs: deadline - last });
      if (status === null) {
        track.state = "gone";
        ended = true;
      } else {
        const before = track.status;
        progressed =
          before === undefined ||
          status.status !== before.status ||
          status.progress !== before.progress;
        track.status = status;
        if (status.status === "completed" || status.status === "failed") {
          track.state = status.status;
          ended = true;
        }
      }
    } catch (error) {
      // A malformed status will not mend itself: final for this job.
      const malformed =
        error instanceof TypegenError && error.code === ErrorCodes.API_INVALID_RESPONSE;
      if (malformed || exitCodeFor(error) !== EXIT_UNAVAILABLE) {
        track.error = error;
        track.state = malformed ? "unverifiable" : "error";
        ended = true;
      } else if (error instanceof TypegenError && typeof error.details?.retryAfterMs === "number") {
        // Counted from when the answer arrived.
        notBefore = Date.now() + error.details.retryAfterMs;
      }
    }

    if (ended) {
      pending.splice(turn, 1);
      interval = POLL_MIN_MS;
    } else {
      turn++;
      if (!progressed) interval = Math.min(interval * 1.5, POLL_MAX_MS);
    }
    progress();
  }

  if (process.stderr.isTTY) process.stderr.write("\n");
  for (const track of pending) {
    track.state = "running";
  }
}

/** The platform's values, written where the local target is missing. */
async function writeMissing(
  setup: Awaited<ReturnType<typeof prepare>>,
  remote: TranslationsResponse,
  report: MergeReport,
): Promise<MergeReport> {
  const { sync, source, targets, localSource, defaultNamespace } = setup;
  if (!localSource) {
    console.error(`⚠  No local catalog for the source locale ${source}: nothing to fill`);
    return { files: [], errors: [] };
  }

  const locales = (targets ?? remote.locales).filter((l) => localeKey(l) !== localeKey(source));
  const spelled = await localSpellings(sync, defaultNamespace, locales);
  const merged: Record<string, Record<string, Record<string, string>>> = {};
  locales.forEach((locale, i) => {
    merged[spelled[i]] = catalogOf(remote.translations, locale) ?? {};
  });

  return mergeMissing(
    {
      sync,
      defaultNamespace,
      sourceLocale: localSource.locale,
      source: localSource.catalog,
      targets: merged,
    },
    report,
  );
}

/** Each locale in the spelling of its local files, else as given. */
async function localSpellings(
  sync: TranslationSync,
  defaultNamespace: string | undefined,
  locales: string[],
): Promise<string[]> {
  const files = await sync.listCatalogFiles(defaultNamespace);
  return locales.map(
    (locale) =>
      files.find((file) => localeKey(file.locale) === localeKey(locale))?.locale ?? locale,
  );
}

function reportDryRun(
  preview: MtFillResponse,
  pushed: number | undefined,
  maxPairs: number | undefined,
  json: boolean,
  say: (line: string) => void,
): number {
  const count = preview.pairs.toTranslate;
  const errors: RunError[] = [];
  let exitCode = 0;
  let warning: string | undefined;
  const limit = maxPairs ?? Infinity;
  if (count > limit) {
    exitCode = 4;
    errors.push({
      type: "over_limit",
      message:
        `${count} key × locale pairs to translate, over --max-keys ${maxPairs}. ` +
        "Raise --max-keys, narrow the run with --locale or --ns, or pass --max-keys 0 for no limit.",
    });
  } else if (count + (pushed ?? 0) > limit) {
    warning =
      `With the values the push adds, the run may go over --max-keys ${maxPairs} ` +
      `(${count} + ~${pushed}). The real run checks after the push, before any MT.`;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          version: 1,
          dryRun: true,
          pairs: preview.pairs,
          estimate: preview.estimate,
          ...(pushed === undefined ? {} : { preview: { pairs: pushed } }),
          jobs: [],
          written: false,
          errors,
          skippedLocales: preview.skippedLocales,
          ok: exitCode === 0,
        },
        null,
        2,
      ),
    );
  }

  say("\n📊 Translate preview (dry run): nothing is pushed, translated or written");
  say(`  On the platform: ${pairsText(count)}, ≈${preview.estimate.credits} credits`);
  if (pushed !== undefined) {
    say(`  Not yet on the platform (would be pushed): ~${pairsText(pushed)} (preview)`);
  }
  if (preview.skippedLocales.length > 0) {
    console.error(
      `⚠  Skipped locales: ${preview.skippedLocales.map((s) => `${s.code} (${s.reason})`).join(", ")}`,
    );
  }
  if (warning) console.error(`⚠  ${warning}`);
  for (const error of errors) console.error(`✗ ${error.message}`);
  return exitCode;
}

function pairsText(count: number): string {
  return `${count} ${count === 1 ? "pair" : "pairs"}`;
}

/**
 * A local, non-authoritative count of the pairs the push would make
 * translatable: the source is non-empty after the push and the target still
 * missing, where the platform does not count the pair today (its source is
 * missing there, or the push empties its target).
 */
function pairsPushWouldAdd(
  result: PushRunResult,
  source: string,
  targets: string[] | undefined,
  forceMode: ForceMode,
): number {
  if (result.status !== "preview") return 0;
  const { local, remote } = result;
  const localWins = forceMode === "override";
  const valueAfterPush = (locale: string, namespace: string, key: string) => {
    const mine = lookup(local, locale, namespace, key);
    const theirs = lookup(remote, locale, namespace, key);
    return localWins ? (mine ?? theirs) : (theirs ?? mine);
  };
  const filled = (value: string | undefined) => value !== undefined && value !== "";

  const known = [
    ...new Set([...(result.projectLocales ?? []), ...Object.keys(remote), ...Object.keys(local)]),
  ];
  // The source itself never counts: its value after the push is filled.
  const targetLocales = targets ?? known;

  // Keys only on the platform are left out: the push leaves them as the
  // platform counts them now, unless it empties a local target of one.
  let count = 0;
  for (const [namespace, keys] of Object.entries(catalogOf(local, source) ?? {})) {
    for (const key of Object.keys(keys)) {
      if (!filled(valueAfterPush(source, namespace, key))) continue;
      const sourceNow = filled(lookup(remote, source, namespace, key));
      for (const target of targetLocales) {
        const countedNow = sourceNow && !filled(lookup(remote, target, namespace, key));
        if (!countedNow && !filled(valueAfterPush(target, namespace, key))) count++;
      }
    }
  }
  return count;
}

function catalogOf(data: TranslationData, locale: string) {
  const key = findLocale(locale, Object.keys(data));
  return key === undefined ? undefined : data[key];
}

function lookup(
  data: TranslationData,
  locale: string,
  namespace: string,
  key: string,
): string | undefined {
  const catalog = catalogOf(data, locale)?.[namespace];
  return catalog && hasOwnKey(catalog, key) ? catalog[key] : undefined;
}
