import { describe, it, expect, beforeEach } from "vitest";
import { TypeEmitter } from "../src/core/TypeEmitter";
import { InMemoryFileSystem } from "../src/core/FileSystemWriter";
import type { ProjectSchema } from "../src/types";

describe("TypeEmitter key shapes", () => {
  let emitter: TypeEmitter;

  beforeEach(() => {
    emitter = new TypeEmitter();
  });

  it("should handle keys with dots after namespace", () => {
    const schema: ProjectSchema = {
      keys: {
        "button:v2.submit": { params: [] },
      },
    };

    const result = emitter.generate(schema);

    expect(result).toContain("'button:v2.submit': never;");
  });

  it("should handle keys with slashes after namespace", () => {
    const schema: ProjectSchema = {
      keys: {
        "test:path/to/key": { params: [] },
      },
    };

    const result = emitter.generate(schema);

    expect(result).toContain("'test:path/to/key': never;");
  });

  it("should handle keys with no parameters", () => {
    const schema: ProjectSchema = {
      keys: {
        "test:empty": { params: [] },
      },
    };

    const result = emitter.generate(schema);

    expect(result).toContain("'test:empty': never;");
  });
});

describe("InMemoryFileSystem", () => {
  let fs: InMemoryFileSystem;

  beforeEach(() => {
    fs = new InMemoryFileSystem();
  });

  it("should handle reading non-existent files", async () => {
    await expect(fs.readFile("non-existent.txt")).rejects.toThrow(/ENOENT/);
  });

  it.each([
    { shape: "a path under a directory", path: "test/file.txt" },
    { shape: "a deeply nested path", path: "a/b/c/file.txt" },
    { shape: "a very long path", path: "a/".repeat(50) + "file.txt" },
    { shape: "dashes in the file name", path: "test/file-with-dashes.txt" },
    { shape: "underscores in the file name", path: "test/file_with_underscores.txt" },
    { shape: "multiple dots in the file name", path: "test/file.multiple.dots.txt" },
  ])("round-trips content written to $shape", async ({ path }) => {
    await fs.writeFile(path, "content");

    await expect(fs.readFile(path)).resolves.toBe("content");
  });

  it("should handle creating nested directories", async () => {
    await fs.mkdir("a/b/c", { recursive: true });

    expect(fs.hasDirectory("/a")).toBe(true);
    expect(fs.hasDirectory("/a/b")).toBe(true);
    expect(fs.hasDirectory("/a/b/c")).toBe(true);
  });

  it("should handle overwriting existing files", async () => {
    await fs.writeFile("test/file.txt", "original");
    await fs.writeFile("test/file.txt", "updated");

    await expect(fs.readFile("test/file.txt")).resolves.toBe("updated");
  });

  it("rejects an exclusive write when the file already exists", async () => {
    await fs.writeFile("test/file.txt", "original");

    await expect(fs.writeFile("test/file.txt", "second", { exclusive: true })).rejects.toThrow(
      /EEXIST/,
    );
    await expect(fs.readFile("test/file.txt")).resolves.toBe("original");
  });

  it("should handle large file contents", async () => {
    const largeContent = "x".repeat(1024);

    await fs.writeFile("test/large.txt", largeContent);

    await expect(fs.readFile("test/large.txt")).resolves.toBe(largeContent);
  });

  it("should handle checking file existence correctly", async () => {
    await fs.writeFile("a/b/c/file.txt", "content");

    expect(fs.hasFile("a/b/c/file.txt")).toBe(true);
    expect(fs.hasFile("a/b/c/non-existent.txt")).toBe(false);
  });

  it("should handle accessing non-existent files", async () => {
    await expect(fs.access("non-existent.txt")).rejects.toThrow(/ENOENT/);
  });

  it("should clear all files", async () => {
    await fs.mkdir("/test", { recursive: true });
    await fs.writeFile("test/file1.txt", "content1");
    await fs.writeFile("test/file2.txt", "content2");

    fs.clear();

    expect(fs.hasFile("test/file1.txt")).toBe(false);
    expect(fs.hasFile("test/file2.txt")).toBe(false);
    expect(fs.hasDirectory("/test")).toBe(false);
  });
});
