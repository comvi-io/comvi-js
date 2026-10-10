import { promises as fs } from "fs";
import { dirname } from "path";
import { wrapError, ErrorCodes } from "../utils/errors";
import { createAtomicTempPath } from "../utils/atomicWrite";

export interface FileWriteOptions {
  exclusive?: boolean;
  mode?: number;
}

export interface FileSystem {
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>;
  writeFile(path: string, content: string, options?: FileWriteOptions): Promise<void>;
  readFile(path: string): Promise<string>;
  access(path: string): Promise<void>;
  /** Optional: enables atomic temp-file + rename writes when implemented */
  rename?(oldPath: string, newPath: string): Promise<void>;
  /** Optional: removes failed temp files after an atomic write */
  unlink?(path: string): Promise<void>;
}

export class NodeFileSystem implements FileSystem {
  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    await fs.mkdir(path, options);
  }

  async writeFile(path: string, content: string, options?: FileWriteOptions): Promise<void> {
    await fs.writeFile(path, content, {
      encoding: "utf-8",
      flag: options?.exclusive ? "wx" : "w",
      mode: options?.mode,
    });
  }

  async readFile(path: string): Promise<string> {
    return await fs.readFile(path, { encoding: "utf-8" });
  }

  async access(path: string): Promise<void> {
    await fs.access(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }

  async unlink(path: string): Promise<void> {
    await fs.unlink(path);
  }
}

export class InMemoryFileSystem implements FileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    if (options?.recursive) {
      const parts = path.split("/").filter(Boolean);
      let current = "";

      for (const part of parts) {
        current += "/" + part;
        this.directories.add(current);
      }
    } else {
      this.directories.add(path);
    }
  }

  async writeFile(path: string, content: string, options?: FileWriteOptions): Promise<void> {
    if (options?.exclusive && this.files.has(path)) {
      throw new Error(`EEXIST: file already exists, open '${path}'`);
    }
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }

  async access(path: string): Promise<void> {
    if (!this.files.has(path) && !this.directories.has(path)) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  hasDirectory(path: string): boolean {
    return this.directories.has(path);
  }

  clear(): void {
    this.files.clear();
    this.directories.clear();
  }
}

export class FileSystemWriter {
  constructor(private fs: FileSystem = new NodeFileSystem()) {}

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await this.fs.mkdir(path, { recursive: true });
    } catch (error) {
      throw wrapError(error, "Failed to create directory", ErrorCodes.FS_MKDIR_FAILED);
    }
  }

  async write(filePath: string, content: string): Promise<void> {
    try {
      await this.ensureDirectory(dirname(filePath));

      // Atomic when the backing fs supports rename, so an interrupted run
      // never leaves a truncated output file
      if (this.fs.rename) {
        const tmpPath = createAtomicTempPath(filePath);
        try {
          await this.fs.writeFile(tmpPath, content, { exclusive: true });
          await this.fs.rename(tmpPath, filePath);
        } catch (error) {
          await this.fs.unlink?.(tmpPath).catch(() => undefined);
          throw error;
        }
      } else {
        await this.fs.writeFile(filePath, content);
      }
    } catch (error) {
      throw wrapError(error, "Failed to write file", ErrorCodes.FS_WRITE_FAILED);
    }
  }

  async read(filePath: string): Promise<string> {
    try {
      return await this.fs.readFile(filePath);
    } catch (error) {
      throw wrapError(error, "Failed to read file", ErrorCodes.FS_READ_FAILED);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
