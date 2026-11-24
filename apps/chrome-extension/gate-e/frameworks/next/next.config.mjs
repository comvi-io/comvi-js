import path from "node:path";
import { fileURLToPath } from "node:url";
import { withComvi } from "@comvi/next/plugin";

// The Next row of Gate E, reached through the mock server (one page origin): it proxies the
// locale-prefixed pages (`/en/…`, `/de/…`) and `/_next/…` here as they are.
export default withComvi()({
  // The repository lints this app with its own ESLint config.
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../..",
  ),
});
