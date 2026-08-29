import { DOMWatcher } from "./DOMWatcher";
import { TranslationScanner } from "./TranslationScanner";
import { TranslationRegistry } from "./TranslationRegistry";
import { EventBus } from "./EventBus";
import { ElementHighlighter } from "./ElementHighlighter";
import { Collector } from "./collector/Collector";
import type { TranslationSystemOptions, TranslationSystemInnerOptions } from "./types";
import type { I18nCoreInstance, I18nCoreExtraApi } from "@comvi/core";
import { TAG_ATTRIBUTES } from "./constants";

/**
 * The public instance surface the editor needs. Instances arrive from both
 * directions — the discovery queue hands over base `@comvi/core` instances,
 * the plugin entry hands over a composed host — and both satisfy this.
 */
export type EditorI18n = I18nCoreInstance & I18nCoreExtraApi;

type EditModalModule = typeof import("./EditModal");
type KeySelectorModule = typeof import("./KeySelector");

let editModalModule: EditModalModule | undefined;
let keySelectorModule: KeySelectorModule | undefined;
let editModalPromise: Promise<EditModalModule> | undefined;
let keySelectorPromise: Promise<KeySelectorModule> | undefined;

function loadEditModal(): Promise<EditModalModule> {
  if (editModalModule) return Promise.resolve(editModalModule);
  editModalPromise ??= import("./EditModal").then(
    (module) => (editModalModule = module),
    (error: unknown) => {
      editModalPromise = undefined;
      throw error;
    },
  );
  return editModalPromise;
}

function loadKeySelector(): Promise<KeySelectorModule> {
  if (keySelectorModule) return Promise.resolve(keySelectorModule);
  keySelectorPromise ??= import("./KeySelector").then(
    (module) => (keySelectorModule = module),
    (error: unknown) => {
      keySelectorPromise = undefined;
      throw error;
    },
  );
  return keySelectorPromise;
}

// Map to store i18n instances by Core instance ID
// Allows multiple plugin instances on the same page
const i18nInstances = new Map<string, EditorI18n>();
let instanceCounter = 0;

/**
 * Get the i18n instance for a specific Core instance
 * @param instanceId - The Core instance ID (optional, returns first if not specified for backward compatibility)
 */
export function getI18nInstance(instanceId?: string): EditorI18n | null {
  if (instanceId) {
    return i18nInstances.get(instanceId) || null;
  }
  // Backward compatibility: return the first (and usually only) instance
  const firstInstance = i18nInstances.values().next().value;
  return firstInstance || null;
}

/**
 * Register an i18n instance with a specific ID
 * @internal
 */
export function registerI18nInstance(instanceId: string, i18n: EditorI18n): void {
  i18nInstances.set(instanceId, i18n);
}

/**
 * Unregister an i18n instance
 * @internal
 */
export function unregisterI18nInstance(instanceId: string): void {
  i18nInstances.delete(instanceId);
}

export class Core {
  private domWatcher: DOMWatcher;
  private translationRegistry: TranslationRegistry;
  private translationScanner: TranslationScanner;
  private eventBus: EventBus;
  private options: TranslationSystemInnerOptions;
  private elementHighlighter: ElementHighlighter;
  private collector: Collector;
  private instanceId: string;
  private defaultNs?: string;
  private stopped = false;

  private handleElementClick = (element: Element): void => {
    const nodes = this.translationRegistry.get(element)?.nodes;
    const nodeDataArray = Array.from(nodes?.values() || []);

    if (nodeDataArray.length > 1) {
      const keyData = nodeDataArray.map((nodeData) => ({
        key: nodeData.key,
        ns: nodeData.ns,
        textPreview: nodeData.textPreview,
      }));

      void Promise.all([loadKeySelector(), loadEditModal()])
        .then(([{ showKeySelector }, { showModal }]) => {
          if (this.stopped) return;
          showKeySelector(
            keyData,
            element,
            (selectedKey, selectedNs) => {
              if (!this.stopped) showModal(selectedKey, selectedNs, this.instanceId);
            },
            this.defaultNs,
          );
        })
        .catch((error: unknown) => {
          if (!this.stopped) console.error("[comvi] Failed to load editor UI:", error);
        });
    } else if (nodeDataArray.length === 1) {
      void loadEditModal()
        .then(({ showModal }) => {
          if (this.stopped) return;
          showModal(nodeDataArray[0]!.key, nodeDataArray[0]!.ns, this.instanceId);
        })
        .catch((error: unknown) => {
          if (!this.stopped) console.error("[comvi] Failed to load editor UI:", error);
        });
    }
  };

  constructor(options?: TranslationSystemOptions, i18n?: EditorI18n) {
    this.instanceId = `core-${++instanceCounter}`;
    this.options = {
      targetElement: options?.targetElement || document,
      tagAttributes: options?.tagAttributes || TAG_ATTRIBUTES,
    };

    if (i18n) {
      registerI18nInstance(this.instanceId, i18n);
    }

    this.defaultNs = i18n?.getDefaultNamespace?.();

    // EventBus wiring: DOMWatcher and TranslationRegistry emit, while
    // TranslationScanner and ElementHighlighter only listen.
    this.eventBus = new EventBus();

    this.elementHighlighter = new ElementHighlighter(this.eventBus, this.handleElementClick, {
      debug: options?.debug,
      highlightStyle: options?.highlightStyle,
      defaultNs: i18n?.getDefaultNamespace?.(),
    });

    this.translationRegistry = new TranslationRegistry(this.eventBus);

    this.domWatcher = new DOMWatcher(this.eventBus, this.options);

    this.translationScanner = new TranslationScanner(
      this.eventBus,
      this.translationRegistry,
      this.options,
    );

    // Passive context collector (extension channel only). Constructed here so
    // both activation paths (standalone.ts and index.ts) cover it; it does
    // nothing until start()/stop() run.
    this.collector = new Collector(this.eventBus, this.translationRegistry, this.instanceId, {
      enabled: options?.collectContext !== false,
      screenGroupResolver: options?.screenGroupResolver,
    });
  }

  public start(): void {
    this.stopped = false;
    this.domWatcher.start();
    void this.collector.start();
  }

  public stop(): void {
    this.stopped = true;

    // Collector FIRST — before registry.destroy() (which emits removal
    // events the collector must not react to) and before anything else
    // tears down state it depends on.
    this.collector.destroy();

    this.domWatcher.stop();
    this.translationScanner.destroy();
    this.elementHighlighter.cleanup();
    this.translationRegistry.destroy();
    this.eventBus.removeAllListeners();

    // Cleanup UI only when its lazy chunk has been loaded.
    editModalModule?.cleanup();
    keySelectorModule?.cleanup();

    unregisterI18nInstance(this.instanceId);
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getRegistry(): TranslationRegistry {
    return this.translationRegistry;
  }
}
