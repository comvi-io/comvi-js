import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConsoleReporter,
  SilentReporter,
  CollectingReporter,
} from "../src/core/GenerationReporter";
import type { Logger } from "../src/utils/logger";

function fakeLogger() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  } satisfies Logger;
}

const STATS = { keysGenerated: 2, duration: 5, filePath: "src/types/i18n.d.ts" };

describe("ConsoleReporter", () => {
  let logger: ReturnType<typeof fakeLogger>;
  let reporter: ConsoleReporter;

  beforeEach(() => {
    logger = fakeLogger();
    reporter = new ConsoleReporter(logger);
  });

  it("reports the start of a run at debug level", () => {
    reporter.reportStart();

    expect(logger.debug).toHaveBeenCalledWith("Starting type generation");
  });

  it("announces the fetch at info level", () => {
    reporter.reportFetching();

    expect(logger.info).toHaveBeenCalledWith("Fetching translations from TMS...");
  });

  it("announces the emit at info level", () => {
    reporter.reportGenerating();

    expect(logger.info).toHaveBeenCalledWith("Generating TypeScript declarations...");
  });

  it("reports the key count, the duration and the output path on success", () => {
    reporter.reportSuccess(STATS);

    expect(logger.info.mock.calls).toEqual([
      ["✓ Generated 2 type definitions in 5ms"],
      ["✓ Output: src/types/i18n.d.ts"],
    ]);
  });

  it("reports a failure with the error message at error level", () => {
    reporter.reportError(new Error("schema fetch failed"));

    expect(logger.error).toHaveBeenCalledWith("Generation failed: schema fetch failed");
  });

  it("passes a warning through unchanged", () => {
    reporter.reportWarning("namespace 'admin' is empty");

    expect(logger.warn).toHaveBeenCalledWith("namespace 'admin' is empty");
  });

  it("falls back to the console when constructed without a logger", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    new ConsoleReporter().reportFetching();

    expect(logSpy).toHaveBeenCalledWith("[comvi] Fetching translations from TMS...");
  });
});

describe("SilentReporter", () => {
  it("writes nothing to the console for any event", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = new SilentReporter();

    reporter.reportStart();
    reporter.reportFetching();
    reporter.reportGenerating();
    reporter.reportSuccess();
    reporter.reportError();
    reporter.reportWarning();

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("CollectingReporter", () => {
  let reporter: CollectingReporter;

  beforeEach(() => {
    reporter = new CollectingReporter();
  });

  it("records every event in the order it arrived", () => {
    reporter.reportStart();
    reporter.reportFetching();
    reporter.reportGenerating();
    reporter.reportSuccess(STATS);

    expect(reporter.reports.map((report) => report.type)).toEqual([
      "start",
      "fetching",
      "generating",
      "success",
    ]);
  });

  it("keeps the payload of the events that carry one", () => {
    const failure = new Error("boom");

    reporter.reportSuccess(STATS);
    reporter.reportError(failure);
    reporter.reportWarning("careful");

    expect(reporter.reports).toEqual([
      { type: "success", data: STATS },
      { type: "error", data: failure },
      { type: "warning", data: "careful" },
    ]);
  });

  it("returns only the payloads of the requested event type", () => {
    reporter.reportWarning("first");
    reporter.reportError(new Error("boom"));
    reporter.reportWarning("second");

    expect(reporter.getReports("warning")).toEqual(["first", "second"]);
  });

  it("returns nothing for an event type that never fired", () => {
    reporter.reportStart();

    expect(reporter.getReports("success")).toEqual([]);
  });

  it("drops everything recorded so far on clear()", () => {
    reporter.reportStart();

    reporter.clear();

    expect(reporter.reports).toEqual([]);
  });
});
