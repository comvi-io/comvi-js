import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { findEnvFile, loadEnv, MissingEnvFileError } from "../src/core/EnvLoader";

/**
 * EnvLoader uses real fs (existsSync / readFileSync) so we drive it with
 * temp directories rather than mocks. Each test sets up its own sandbox to
 * avoid cross-contamination — process.env is also restored per test.
 */
describe("EnvLoader", () => {
  let sandbox: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sandbox = mkdtempSync(resolve(tmpdir(), "comvi-envloader-"));
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  describe("findEnvFile", () => {
    it("finds .env in the start dir", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      writeFileSync(resolve(sandbox, ".env"), "FOO=1");

      expect(findEnvFile(sandbox)).toBe(resolve(sandbox, ".env"));
    });

    it("walks up to find .env in a parent dir", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      writeFileSync(resolve(sandbox, ".env"), "FOO=1");

      const nested = resolve(sandbox, "packages", "app", "src");
      mkdirSync(nested, { recursive: true });

      expect(findEnvFile(nested)).toBe(resolve(sandbox, ".env"));
    });

    it("stops at the project root (package.json) — does not escape into shared CI dirs", () => {
      // Layout:
      //   sandbox/.env                <- DECOY (must NOT be picked up)
      //   sandbox/project/package.json
      //   sandbox/project/src/        <- start dir
      // The walk-up should hit project/package.json and stop, never seeing
      // sandbox/.env. This is the CI-runner-with-shared-builds-dir scenario.
      writeFileSync(resolve(sandbox, ".env"), "DECOY=1");
      const project = resolve(sandbox, "project");
      mkdirSync(resolve(project, "src"), { recursive: true });
      writeFileSync(resolve(project, "package.json"), "{}");

      expect(findEnvFile(resolve(project, "src"))).toBeNull();
    });

    it("returns null when no .env exists in the project tree", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      expect(findEnvFile(sandbox)).toBeNull();
    });
  });

  describe("loadEnv — non-overwrite contract", () => {
    it("injects new vars into process.env", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      writeFileSync(resolve(sandbox, ".env"), "COMVI_TEST_NEW=hello\nCOMVI_TEST_OTHER=world");

      const result = loadEnv({ cwd: sandbox });

      expect(result).not.toBeNull();
      expect(result!.added).toBe(2);
      expect(result!.skipped).toBe(0);
      expect(process.env.COMVI_TEST_NEW).toBe("hello");
      expect(process.env.COMVI_TEST_OTHER).toBe("world");
    });

    it("does NOT overwrite existing process.env vars (CI safety)", () => {
      // The whole point of this loader: a checked-in .env must NEVER
      // override what the CI pipeline exported.
      process.env.COMVI_API_KEY = "real-prod-key";
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      writeFileSync(resolve(sandbox, ".env"), "COMVI_API_KEY=fake-dev-key\nCOMVI_TEST_NEW=ok");

      const result = loadEnv({ cwd: sandbox });

      expect(process.env.COMVI_API_KEY).toBe("real-prod-key");
      expect(process.env.COMVI_TEST_NEW).toBe("ok");
      expect(result!.added).toBe(1);
      expect(result!.skipped).toBe(1);
    });

    it("treats empty string in process.env as 'set' (does not overwrite)", () => {
      // Edge case: shells frequently export empty strings. We must NOT
      // promote a .env value over an explicitly-set-empty real env var,
      // because the user may have chosen empty deliberately.
      process.env.COMVI_TEST_EMPTY = "";
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      writeFileSync(resolve(sandbox, ".env"), "COMVI_TEST_EMPTY=fallback");

      loadEnv({ cwd: sandbox });

      expect(process.env.COMVI_TEST_EMPTY).toBe("");
    });
  });

  describe("loadEnv — disabled / missing / explicit-path", () => {
    it("returns null and is a no-op when disabled", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      writeFileSync(resolve(sandbox, ".env"), "COMVI_TEST_DISABLED=should-not-appear");

      const result = loadEnv({ cwd: sandbox, disabled: true });

      expect(result).toBeNull();
      expect(process.env.COMVI_TEST_DISABLED).toBeUndefined();
    });

    it("returns null when no .env exists (auto-discovery miss is silent)", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");

      expect(loadEnv({ cwd: sandbox })).toBeNull();
    });

    it("loads from an explicit path (relative to cwd)", () => {
      writeFileSync(resolve(sandbox, "package.json"), "{}");
      const subdir = resolve(sandbox, "config");
      mkdirSync(subdir);
      writeFileSync(resolve(subdir, "prod.env"), "COMVI_TEST_FROM_EXPLICIT=yes");

      const result = loadEnv({ cwd: sandbox, explicitPath: "config/prod.env" });

      expect(result!.path).toBe(resolve(subdir, "prod.env"));
      expect(process.env.COMVI_TEST_FROM_EXPLICIT).toBe("yes");
    });

    it("loads from an absolute explicit path", () => {
      const file = resolve(sandbox, "abs.env");
      writeFileSync(file, "COMVI_TEST_ABS=ok");

      loadEnv({ explicitPath: file });

      expect(process.env.COMVI_TEST_ABS).toBe("ok");
    });

    it("throws MissingEnvFileError when explicitPath does not exist (fail-loud)", () => {
      const missing = resolve(sandbox, "missing.env");

      expect(() => loadEnv({ cwd: sandbox, explicitPath: missing })).toThrow(MissingEnvFileError);
    });

    it("warns and returns null on a malformed .env (does not crash CI)", () => {
      // parseEnv is permissive; we exercise the error path by feeding a
      // genuinely unreadable file (a directory in place of a file).
      const dirAsFile = resolve(sandbox, ".env");
      mkdirSync(dirAsFile);
      writeFileSync(resolve(sandbox, "package.json"), "{}");

      const stderrChunks: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = ((chunk: unknown) => {
        stderrChunks.push(String(chunk));
        return true;
      }) as typeof process.stderr.write;

      try {
        const result = loadEnv({ cwd: sandbox });
        expect(result).toBeNull();
        expect(stderrChunks.join("")).toMatch(/failed to parse/);
      } finally {
        process.stderr.write = originalWrite;
      }
    });
  });
});
