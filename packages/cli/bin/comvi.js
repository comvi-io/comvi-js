#!/usr/bin/env node

// Import the CLI from the built dist directory
import("../dist/cli.js").catch((error) => {
  console.error("Failed to load CLI:", error.message);
  process.exit(1);
});
