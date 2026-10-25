// Lets TypeScript 6 accept `import "../globals.css"`: Next 15 declares only CSS modules
// (Next 16 declares plain `*.css` itself, so test-apps/next16 needs no copy).
declare module "*.css";
