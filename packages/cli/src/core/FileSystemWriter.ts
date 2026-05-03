/**
 * FileSystemWriter - Abstraction for file system operations
 *
 * This abstraction follows the Dependency Inversion Principle (DIP),
 * allowing us to inject different file system implementations for
 * testing or alternative environments (e.g., in-memory, cloud storage).
 */

import { promises as fs } from "fs";
import { dirname } from "path";
import { wrapError, ErrorCodes } from "../utils/errors";

/**
 * File system interface for dependency injection
 */
export interface FileSystem {
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  access(path: string): Promise<void>;
}

/**
 * Node.js file system implementation
 */
export class NodeFileSystem implements FileSystem {
  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    await fs.mkdir(path, options);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, { encoding: "utf-8" });
  }

  async readFile(path: string): Promise<string> {
    return await fs.readFile(path, { encoding: "utf-8" });
  }

  async access(path: string): Promise<void> {
    await fs.access(path);
  }
}

/**
 * In-memory file system for testing
 */
export class InMemoryFileSystem implements FileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    if (options?.recursive) {
      // Create all parent directories
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

  async writeFile(path: string, content: string): Promise<void> {
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

  // Test helpers
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

/**
 * File system writer with directory management
 */
export class FileSystemWriter {
  constructor(private fs: FileSystem = new NodeFileSystem()) {}

  /**
   * Ensure directory exists, creating it recursively if needed
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      await this.fs.mkdir(path, { recursive: true });
    } catch (error) {
      throw wrapError(error, "Failed to create directory", ErrorCodes.FS_MKDIR_FAILED);
    }
  }

  /**
   * Write content to file, ensuring directory exists
   */
  async write(filePath: string, content: string): Promise<void> {
    try {
      // Ensure parent directory exists
      await this.ensureDirectory(dirname(filePath));

      // Write file
      await this.fs.writeFile(filePath, content);
    } catch (error) {
      throw wrapError(error, "Failed to write file", ErrorCodes.FS_WRITE_FAILED);
    }
  }

  /**
   * Read content from file
   */
  async read(filePath: string): Promise<string> {
    try {
      return await this.fs.readFile(filePath);
    } catch (error) {
      throw wrapError(error, "Failed to read file", ErrorCodes.FS_READ_FAILED);
    }
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await this.fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
