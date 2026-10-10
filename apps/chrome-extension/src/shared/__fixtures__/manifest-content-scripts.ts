/**
 * The content-script block both the unit artifact check and the gate-e system
 * spec assert against. One copy, so the two cannot drift apart.
 */
export const EXPECTED_CONTENT_SCRIPTS = [
  {
    matches: ["<all_urls>"],
    js: ["detector.js"],
    world: "MAIN",
    run_at: "document_idle",
  },
  {
    matches: ["<all_urls>"],
    js: ["bridge.js"],
    run_at: "document_start",
  },
];
