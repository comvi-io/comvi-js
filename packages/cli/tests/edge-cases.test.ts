import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { TypeEmitter } from "../src/core/TypeEmitter";
import { FileSystemWriter, InMemoryFileSystem, NodeFileSystem } from "../src/core/FileSystemWriter";
import type { FileSystem, FileWriteOptions } from "../src/core/FileSystemWriter";
import { ErrorCodes, TypegenError } from "../src/utils/errors";
import type { ProjectSchema } from "../src/types";
import { makeTempDir, rejectionOf, removeTempDirs } from "./helpers";

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

  it("registers only the exact path for a non-recursive mkdir", async () => {
    await fs.mkdir("/a/b");

    expect(fs.hasDirectory("/a/b")).toBe(true);
    expect(fs.hasDirectory("/a")).toBe(false);
  });

  it("creates absolute-path directories without empty segments", async () => {
    await fs.mkdir("/x/y", { recursive: true });

    expect(fs.hasDirectory("/x")).toBe(true);
    expect(fs.hasDirectory("/x/y")).toBe(true);
  });

  it("access resolves for existing files and directories", async () => {
    await fs.writeFile("data/file.txt", "content");
    await fs.mkdir("/data-dir", { recursive: true });

    await expect(fs.access("data/file.txt")).resolves.toBeUndefined();
    await expect(fs.access("/data-dir")).resolves.toBeUndefined();
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

describe("NodeFileSystem", () => {
  afterEach(removeTempDirs);

  it("writes and reads files without options", async () => {
    const dir = await makeTempDir("comvi-nodefs");
    const nodeFs = new NodeFileSystem();
    const file = join(dir, "plain.txt");

    await nodeFs.writeFile(file, "plain content");

    await expect(nodeFs.readFile(file)).resolves.toBe("plain content");
  });

  it("performs an exclusive write when the file is new", async () => {
    const dir = await makeTempDir("comvi-nodefs");
    const nodeFs = new NodeFileSystem();
    const file = join(dir, "fresh.txt");

    await nodeFs.writeFile(file, "fresh", { exclusive: true });

    await expect(nodeFs.readFile(file)).resolves.toBe("fresh");
  });

  it("refuses an exclusive write over an existing file", async () => {
    const dir = await makeTempDir("comvi-nodefs");
    const nodeFs = new NodeFileSystem();
    const file = join(dir, "taken.txt");
    await nodeFs.writeFile(file, "first");

    await expect(nodeFs.writeFile(file, "second", { exclusive: true })).rejects.toThrow(/EEXIST/);

    await expect(nodeFs.readFile(file)).resolves.toBe("first");
  });

  it("access reflects file existence", async () => {
    const dir = await makeTempDir("comvi-nodefs");
    const nodeFs = new NodeFileSystem();
    const file = join(dir, "checked.txt");

    await expect(nodeFs.access(file)).rejects.toThrow(/ENOENT/);
    await nodeFs.writeFile(file, "here");
    await expect(nodeFs.access(file)).resolves.toBeUndefined();
  });

  it("unlink removes the file", async () => {
    const dir = await makeTempDir("comvi-nodefs");
    const nodeFs = new NodeFileSystem();
    const file = join(dir, "removed.txt");
    await nodeFs.writeFile(file, "temporary");

    await nodeFs.unlink(file);

    await expect(nodeFs.access(file)).rejects.toThrow(/ENOENT/);
  });
});

describe("FileSystemWriter error contracts", () => {
  function workingFs(): FileSystem {
    return {
      async mkdir() {},
      async writeFile() {},
      async readFile() {
        return "";
      },
      async access() {},
    };
  }

  it("wraps mkdir failures with FS_MKDIR_FAILED", async () => {
    const writer = new FileSystemWriter({
      ...workingFs(),
      async mkdir() {
        throw new Error("disk full");
      },
      async rename() {},
    });

    const error = await rejectionOf(writer.write("/out/file.txt", "content"));

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.FS_MKDIR_FAILED);
    expect((error as TypegenError).message).toContain("Failed to create directory");
    expect((error as TypegenError).message).toContain("disk full");
  });

  it("requests an exclusive temp file for atomic writes", async () => {
    const optionsSeen: Array<FileWriteOptions | undefined> = [];
    const writer = new FileSystemWriter({
      ...workingFs(),
      async writeFile(_path: string, _content: string, options?: FileWriteOptions) {
        optionsSeen.push(options);
      },
      async rename() {},
    });

    await writer.write("/out/file.txt", "content");

    expect(optionsSeen).toEqual([{ exclusive: true }]);
  });

  it("keeps the original failure when the fs cannot clean up its temp file", async () => {
    const writer = new FileSystemWriter({
      ...workingFs(),
      async writeFile() {
        throw new Error("quota exceeded");
      },
      async rename() {},
    });

    const error = await rejectionOf(writer.write("/out/file.txt", "content"));

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.FS_WRITE_FAILED);
    expect((error as TypegenError).message).toContain("Failed to write file");
    expect((error as TypegenError).message).toContain("quota exceeded");
  });

  it("wraps read failures with FS_READ_FAILED", async () => {
    const writer = new FileSystemWriter(new InMemoryFileSystem());

    const error = await rejectionOf(writer.read("/missing.txt"));

    expect(error).toBeInstanceOf(TypegenError);
    expect((error as TypegenError).code).toBe(ErrorCodes.FS_READ_FAILED);
    expect((error as TypegenError).message).toContain("Failed to read file");
  });

  it("exists reports presence through the backing fs", async () => {
    const memFs = new InMemoryFileSystem();
    await memFs.writeFile("/present.txt", "x");
    const writer = new FileSystemWriter(memFs);

    await expect(writer.exists("/present.txt")).resolves.toBe(true);
    await expect(writer.exists("/absent.txt")).resolves.toBe(false);
  });
});
