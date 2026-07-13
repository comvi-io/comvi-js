import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";

export interface AtomicWriteOptions {
  mode?: number;
}

export function createAtomicTempPath(filePath: string): string {
  return `${filePath}.${process.pid}.${randomUUID()}.tmp`;
}

export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const tempPath = createAtomicTempPath(filePath);

  try {
    await fs.writeFile(tempPath, content, {
      encoding: "utf-8",
      flag: "wx",
      mode: options.mode,
    });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
