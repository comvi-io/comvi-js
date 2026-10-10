/**
 * Build-time helper for vite.config.ts: whether an output directory is the
 * shippable release directory (dist/), however it is spelled. Test-only
 * host permissions must never be written there.
 */
import { resolve } from "node:path";

export const RELEASE_DIR_NAME = "dist";

export function isReleaseOutput(
  outDir: string,
  packageDir: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const target = resolve(packageDir, outDir);
  const release = resolve(packageDir, RELEASE_DIR_NAME);
  // The default macOS and Windows file systems ignore case, so "DIST"
  // writes into dist/ there.
  const caseInsensitive = platform === "darwin" || platform === "win32";
  return caseInsensitive ? target.toLowerCase() === release.toLowerCase() : target === release;
}
