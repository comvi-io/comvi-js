// Type-level smoke test: the /slim, /icu, /tags, and /editor-bridge subpaths
// resolve and expose the contracted surface. (Published-artifact resolution
// under moduleResolution bundler/node16 is exercised by attw/publint and the
// bundler-matrix job against dist.)
import { createI18n as createSlimI18n } from "@comvi/core/slim";
import { attachLoader, createImportMapLoader, type LoaderFn } from "@comvi/core/loader";
import { icuCompiler, type MessageCompiler } from "@comvi/core/icu";
import {
  registerTagSyntax,
  tagSyntaxExtension,
  createElement,
  isVirtualNode,
  type SyntaxExtension,
  type VirtualNode,
} from "@comvi/core/tags";
import {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  toRecordOfNumbers,
  readEditorMappings,
  type InContextEditorMappings,
} from "@comvi/core/editor-bridge";
import { createI18n } from "@comvi/core";

// slim: plain options, missingParam option, and compiler injection all type.
const slim = createSlimI18n({ locale: "en" });
// (TranslationKeys is augmented by default-params.test-d.ts in this program.)
slim.t("count", { count: 1 });
createSlimI18n({ locale: "en", missingParam: "drop" });
createSlimI18n({ locale: "en", compiler: icuCompiler });

// icu: the compiler satisfies the (internal, subpath-exported) contract type.
const compiler: MessageCompiler = icuCompiler;
void compiler;

// tags: registration returns a disposer; the extension object is passable
// through the per-call channel; VirtualNode toolbox is typed.
const dispose: () => void = registerTagSyntax();
dispose();
const ext: SyntaxExtension = tagSyntaxExtension;
createI18n({ locale: "en", tagInterpolation: { extensions: [ext] } });
const node: VirtualNode = createElement("strong", {}, ["hi"]);
if (isVirtualNode(node)) {
  node.type satisfies "element" | "text" | "fragment";
}

// root: missingParam is part of the base options.
createI18n({ locale: "en", missingParam: "literal" });

// @ts-expect-error — missingParam only accepts "literal" | "drop"
createI18n({ locale: "en", missingParam: "silent" });

// editor-bridge: constants are literal-typed; the guard narrows to the
// bridge interface; the validator returns a numeric record or undefined.
EDITOR_MAPPINGS_GLOBAL satisfies "__comviInContextEditorMappings";
EDITOR_INITIAL_MAPPINGS_GLOBAL satisfies "__comviInContextEditorInitialMappings";
const maybeMappings: Record<string, number> | undefined = toRecordOfNumbers({ a: 1 });
void maybeMappings;
const bridge: InContextEditorMappings | undefined = readEditorMappings(createI18n({ locale: "en" }));
if (bridge) {
  const snapshot: Record<string, number> = bridge.getKeyMappings();
  bridge.loadKeyMappings(snapshot);
}

// @ts-expect-error — the guard result may be undefined; direct call must not type
readEditorMappings({}).getKeyMappings();

// ── /loader: the composition surface (Phase 7) ────────────────────────────

// A bare slim instance genuinely lacks the loader capability.
// @ts-expect-error — registerLoader lives in @comvi/core/loader
slim.registerLoader(async () => ({}));
// @ts-expect-error — reloadTranslations lives in @comvi/core/loader
slim.reloadTranslations();

// attachLoader returns the instance widened with the loader API.
const withLoader = attachLoader(createSlimI18n({ locale: "en" }));
const loaderFn: LoaderFn = async () => ({ hello: "world" });
withLoader.registerLoader(loaderFn);
const registered: LoaderFn | undefined = withLoader.getLoader();
void registered;
void withLoader.reloadTranslations("en", "default");
// the base surface survives the widening
withLoader.t("count", { count: 1 });

// createImportMapLoader now lives in /loader and produces a plain LoaderFn.
const mapLoader: LoaderFn = createImportMapLoader(
  { en: async () => ({ default: { hello: "world" } }) },
  () => "default",
);
withLoader.registerLoader(mapLoader);

// The root entry keeps accepting an import map directly.
createI18n({ locale: "en" }).registerLoader({ en: async () => ({ hello: "world" }) });
