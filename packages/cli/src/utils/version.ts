import { readFileSync } from "node:fs";

/**
 * Resolve the package version from package.json.
 * Tried relative to both dist (../package.json) and src (../../package.json)
 * so it works for the built CLI and for tests importing source directly.
 */
function readPackageVersion(): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const pkg = JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8")) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === "@comvi/cli" && pkg.version) {
        return pkg.version;
      }
    } catch {
      // try next candidate
    }
  }
  return "0.0.0";
}

export const CLI_VERSION = readPackageVersion();
