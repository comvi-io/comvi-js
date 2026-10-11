import type { ResolveAcceptLanguage } from "./types";

/**
 * The module's generated `#build/comvi.detection`: the app's
 * `resolveAcceptLanguage` copied in as source, since runtime config carries
 * JSON only. Method shorthand (`resolveAcceptLanguage(h) {…}`) is not an
 * expression on its own, so it is read back off an object literal.
 */
export function detectionTemplate(fn: ResolveAcceptLanguage | undefined): string {
  if (fn === undefined) {
    return "export const resolveAcceptLanguage = undefined;\n";
  }
  if (typeof fn !== "function") {
    throw new TypeError(
      "[@comvi/nuxt] `localeDetection.resolveAcceptLanguage` must be a function.",
    );
  }
  const source = Function.prototype.toString.call(fn);
  for (const expression of [`(${source})`, `Object.values({ ${source} })[0]`]) {
    try {
      // Parse only: the body is never run at build time. A bound or native
      // function's source is `function () { [native code] }`, which does not
      // parse, so it falls through to the error below.
      new Function(`return ${expression};`);
      return `export const resolveAcceptLanguage = ${expression};\n`;
    } catch {
      // Not this form; try the next.
    }
  }
  throw new TypeError(
    "[@comvi/nuxt] `localeDetection.resolveAcceptLanguage` could not be copied into the build. " +
      "Write it as a self-contained function expression: it cannot be a bound or native function.",
  );
}
