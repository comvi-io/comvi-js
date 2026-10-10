// Inert `next/headers`. See package.json: the bundler matrix measures the
// comvi module graph, not Next's runtime.
const unavailable = (name) => () => {
  throw new Error(`[bundler-matrix] next/headers ${name}() is a stub and must not be called`);
};

export const headers = unavailable("headers");
export const cookies = unavailable("cookies");
export const draftMode = unavailable("draftMode");
