// The compatibility builder that preserves the published `createNextI18n`
// composed semantics on top of the converged single base entry. Not listed in
// package.json#exports; `createNextI18n` is its only caller.
//
// Composition order mirrors the 0.4 root constructor:
//   loader capability → plugin capability → catalog ingestion,
// so the reflective own-property order is unchanged. (Nested constructor
// catalogs no longer depend on this order: the base instance flattens them itself.)
// Discovery is NOT composed here: like every other binding, an app that wants
// the browser extension to see it adds `.use(devtools())` to the result.
import "@comvi/core/tags"; // ambient tag syntax, as the 0.4 root registered it
import { I18n, createI18n } from "@comvi/core";
import { attachLoader, createImportMapLoader } from "@comvi/core/loader";
import type { LoaderImportMap } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import type {
  DefaultTranslationParams,
  I18nLoaderApi,
  I18nOptions,
  I18nPluginApi,
  LoaderFn,
} from "@comvi/core";

/**
 * The EXACT public instance type `createNextI18n` exposes: the base instance, the
 * loader API with BOTH `registerLoader` overloads, and the plugin capability.
 */
export type NextComposedI18n<D extends DefaultTranslationParams = {}> = I18n<D> &
  Omit<I18nLoaderApi, "registerLoader"> &
  I18nPluginApi & {
    registerLoader(loader: LoaderFn): void;
    registerLoader(importMap: LoaderImportMap): void;
  };

export function createComposedNextI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): NextComposedI18n<D> {
  const { messages, ...rest } = options as I18nOptions<D> & {
    messages?: I18nOptions["messages"];
  };

  // The compiler is the caller's, and nothing defaults it: `createNextI18n`
  // forwards whatever the app named, so an app that never names one gets
  // core's `{param}` compiler exactly as `createI18n` does. ICU is never
  // enabled here.
  const instance = attachPlugins(attachLoader(createI18n<D>(rest as unknown as I18nOptions<D>)));

  // The 0.4 root's `registerLoader` accepted a static import map as well as a
  // loader function; `attachLoader` installs only the function form, so the
  // overload is restored here.
  //
  // `defineProperty`, never a plain assignment: the reflective contract is that
  // a spread of an instance carries DATA only, never behaviour. An assignment only
  // preserves `enumerable: false` while `attachLoader` happens to install
  // `registerLoader` as an OWN descriptor; the moment a capability moves to a
  // prototype install — which is what `core/full.ts` does — `instance.registerLoader
  // = fn` would silently create an enumerable own property and leak the method
  // into `{ ...instance }`.
  const registerLoaderFn = instance.registerLoader.bind(instance) as (loader: LoaderFn) => void;
  Object.defineProperty(instance, "registerLoader", {
    value: (loader: LoaderFn | LoaderImportMap): void => {
      registerLoaderFn(
        typeof loader === "object" && loader !== null
          ? createImportMapLoader(loader, () => instance.getDefaultNamespace())
          : loader,
      );
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });

  if (messages !== undefined) {
    instance.addMessages(messages as Record<string, Record<string, never>>);
  }

  return instance as unknown as NextComposedI18n<D>;
}
