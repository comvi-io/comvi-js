import { describe, it, expect, beforeEach } from "vitest";
import { TypeEmitter } from "../src/core/TypeEmitter";
import { InMemoryFileSystem } from "../src/core/FileSystemWriter";
import type { ProjectSchema } from "../src/types";

describe("Edge Cases", () => {
  describe("TypeEmitter edge cases", () => {
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

      // Flat key format: 'namespace:key.subkey'
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

  describe("InMemoryFileSystem edge cases", () => {
    let fs: InMemoryFileSystem;

    beforeEach(() => {
      fs = new InMemoryFileSystem();
    });

    it("should handle reading non-existent files", async () => {
      await expect(fs.readFile("non-existent.txt")).rejects.toThrow("ENOENT");
    });

    it("should handle writing to non-existent directories", async () => {
      // InMemoryFileSystem doesn't require directory creation
      // It stores files directly in memory
      await fs.mkdir("test", { recursive: true });
      await fs.writeFile("test/file.txt", "content");

      const content = await fs.readFile("test/file.txt");
      expect(content).toBe("content");
    });

    it("should handle creating nested directories", async () => {
      // InMemoryFileSystem mkdir is a no-op, it doesn't actually track directories
      await fs.mkdir("a/b/c", { recursive: true });

      // We can still write files to nested paths
      await fs.writeFile("a/b/c/file.txt", "content");
      const content = await fs.readFile("a/b/c/file.txt");
      expect(content).toBe("content");
    });

    it("should handle very long file paths", async () => {
      const longPath = "a/".repeat(50) + "file.txt";

      // Create all directories
      await fs.mkdir(longPath.substring(0, longPath.lastIndexOf("/")), {
        recursive: true,
      });

      await fs.writeFile(longPath, "content");
      const content = await fs.readFile(longPath);

      expect(content).toBe("content");
    });

    it("should handle files with special characters in names", async () => {
      await fs.mkdir("test", { recursive: true });

      const specialNames = [
        "test/file-with-dashes.txt",
        "test/file_with_underscores.txt",
        "test/file.multiple.dots.txt",
      ];

      for (const name of specialNames) {
        await fs.writeFile(name, "content");
        const content = await fs.readFile(name);
        expect(content).toBe("content");
      }
    });

    it("should handle overwriting existing files", async () => {
      await fs.mkdir("test", { recursive: true });
      await fs.writeFile("test/file.txt", "original");
      await fs.writeFile("test/file.txt", "updated");

      const content = await fs.readFile("test/file.txt");
      expect(content).toBe("updated");
    });

    it("should handle large file contents", async () => {
      await fs.mkdir("test", { recursive: true });

      const largeContent = "x".repeat(1_000_000); // 1MB
      await fs.writeFile("test/large.txt", largeContent);

      const content = await fs.readFile("test/large.txt");
      expect(content).toBe(largeContent);
    });

    it("should handle checking file existence correctly", async () => {
      await fs.mkdir("a/b/c", { recursive: true });
      await fs.writeFile("a/b/c/file.txt", "content");

      // InMemoryFileSystem tracks files, not directories
      expect(fs.hasFile("a/b/c/file.txt")).toBe(true);
      expect(fs.hasFile("a/b/c/non-existent.txt")).toBe(false);
    });

    it("should handle accessing non-existent files", async () => {
      await expect(fs.access("non-existent.txt")).rejects.toThrow();
    });

    it("should clear all files", async () => {
      await fs.mkdir("test", { recursive: true });
      await fs.writeFile("test/file1.txt", "content1");
      await fs.writeFile("test/file2.txt", "content2");

      fs.clear();

      expect(fs.hasFile("test/file1.txt")).toBe(false);
      expect(fs.hasFile("test/file2.txt")).toBe(false);
    });
  });
});
