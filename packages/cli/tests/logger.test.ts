import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConsoleLogger,
  SilentLogger,
  LogLevel,
  createLogger,
  type Logger,
} from "../src/utils/logger";

/** Console lines tagged with the channel they went to, in call order. */
function recordConsole(): string[] {
  const lines: string[] = [];
  const record = (channel: string) => (message: unknown) =>
    void lines.push(`${channel} ${message}`);

  vi.spyOn(console, "error").mockImplementation(record("error"));
  vi.spyOn(console, "warn").mockImplementation(record("warn"));
  vi.spyOn(console, "log").mockImplementation(record("log"));

  return lines;
}

function emitEveryLevel(logger: Logger): void {
  logger.error("E");
  logger.warn("W");
  logger.info("I");
  logger.debug("D");
}

/** Each level with the console channel it writes to. */
const CONTEXT_CASES: Array<[keyof Omit<Logger, "setLevel">, "error" | "warn" | "log"]> = [
  ["error", "error"],
  ["warn", "warn"],
  ["info", "log"],
  ["debug", "log"],
];

const THROUGH_ERROR = ["error [comvi] E"];
const THROUGH_WARN = [...THROUGH_ERROR, "warn [comvi] W"];
const THROUGH_INFO = [...THROUGH_WARN, "log [comvi] I"];
const THROUGH_DEBUG = [...THROUGH_INFO, "log [comvi] D"];

describe("ConsoleLogger", () => {
  let lines: string[];

  beforeEach(() => {
    lines = recordConsole();
    vi.stubEnv("COMVI_LOG_LEVEL", undefined);
  });

  it.each([
    ["error", THROUGH_ERROR],
    ["warn", THROUGH_WARN],
    ["info", THROUGH_INFO],
    ["debug", THROUGH_DEBUG],
    ["DEBUG", THROUGH_DEBUG],
    ["chatty", THROUGH_INFO],
  ])("COMVI_LOG_LEVEL=%s emits %j", (envLevel, expected) => {
    vi.stubEnv("COMVI_LOG_LEVEL", envLevel);

    emitEveryLevel(new ConsoleLogger());

    expect(lines).toEqual(expected);
  });

  it("logs down to info when COMVI_LOG_LEVEL is unset", () => {
    emitEveryLevel(new ConsoleLogger());

    expect(lines).toEqual(THROUGH_INFO);
  });

  it("lets an explicit constructor level override COMVI_LOG_LEVEL", () => {
    vi.stubEnv("COMVI_LOG_LEVEL", "error");

    emitEveryLevel(new ConsoleLogger(LogLevel.DEBUG));

    expect(lines).toEqual(THROUGH_DEBUG);
  });

  it("applies setLevel to everything logged after it", () => {
    const logger = new ConsoleLogger(LogLevel.ERROR);

    emitEveryLevel(logger);
    logger.setLevel(LogLevel.DEBUG);
    emitEveryLevel(logger);

    expect(lines).toEqual([...THROUGH_ERROR, ...THROUGH_DEBUG]);
  });

  it.each(CONTEXT_CASES)(
    "%s() passes a context value to console.%s as a second argument",
    (method, channel) => {
      const spy = vi.spyOn(console, channel).mockImplementation(() => {});
      const cause = { code: "ENOENT" };

      new ConsoleLogger(LogLevel.DEBUG)[method]("write failed", cause);

      expect(spy).toHaveBeenCalledWith("[comvi] write failed", cause);
    },
  );

  it.each(CONTEXT_CASES)(
    "%s() logs the message alone on console.%s when no context is given",
    (method, channel) => {
      const spy = vi.spyOn(console, channel).mockImplementation(() => {});

      new ConsoleLogger(LogLevel.DEBUG)[method]("write failed");

      expect(spy).toHaveBeenCalledWith("[comvi] write failed");
    },
  );
});

describe("SilentLogger", () => {
  it("writes nothing to the console, at any level", () => {
    const lines = recordConsole();
    const logger: Logger = new SilentLogger();

    emitEveryLevel(logger);
    logger.setLevel(LogLevel.DEBUG);
    emitEveryLevel(logger);

    expect(lines).toEqual([]);
  });
});

describe("createLogger()", () => {
  let lines: string[];

  beforeEach(() => {
    lines = recordConsole();
    vi.stubEnv("COMVI_LOG_LEVEL", undefined);
  });

  it("returns a console logger by default", () => {
    emitEveryLevel(createLogger());

    expect(lines).toEqual(THROUGH_INFO);
  });

  it("returns a silent logger when asked for one", () => {
    emitEveryLevel(createLogger(true));

    expect(lines).toEqual([]);
  });

  it("hands the requested level to the console logger", () => {
    emitEveryLevel(createLogger(false, LogLevel.ERROR));

    expect(lines).toEqual(THROUGH_ERROR);
  });
});
