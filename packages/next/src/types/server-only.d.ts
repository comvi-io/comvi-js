// `server-only` ships no declaration file; it is a bare marker module whose only job is to make
// a client-side import fail the Next build. TypeScript 6 rejects an untyped side-effect import,
// so declare it here.
declare module "server-only";
