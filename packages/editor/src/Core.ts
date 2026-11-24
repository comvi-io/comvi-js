import { DOMWatcher } from "./DOMWatcher";
import { TranslationScanner } from "./TranslationScanner";
import { TranslationRegistry } from "./TranslationRegistry";
import { EventBus } from "./EventBus";
import { ElementHighlighter } from "./ElementHighlighter";
import { Collector } from "./collector/Collector";
import type { TranslationSystemOptions, TranslationSystemInnerOptions } from "./types";
import type { NodeData } from "./types/translation";
import type { Session, Target } from "./adapter";
import { TAG_ATTRIBUTES } from "./constants";

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

// The session of each running Core, by Core id: a save writes back through it.
const sessions = new Map<string, Session>();
let instanceCounter = 0;

/** The session of the Core `scopeId` (the first one when not given). */
export function getSession(scopeId?: string): Session | null {
  if (scopeId) return sessions.get(scopeId) ?? null;
  return sessions.values().next().value ?? null;
}

/** Whether `node` lies inside the extent of the rich pair that opens in `open`. */
function inPair(open: Node, close: Node, node: Node): boolean {
  const after =
    open.compareDocumentPosition(node) &
    (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY);
  const before =
    node === close ||
    close.compareDocumentPosition(node) &
      (Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINS);
  return Boolean(after) && Boolean(before) && !node.contains(open);
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
  private session?: Session;
  private stopped = false;

  /**
   * The keys a click on `target` inside `element` opens: the frames whose instance resolves
   * (an unknown or ambiguous `inst` is not clickable), narrowed to the innermost rich pair
   * that encloses the clicked node when one does.
   */
  private candidates(element: Element, target?: Node): (NodeData & { to: Target })[] {
    const all: (NodeData & { from: Node })[] = [];
    for (const [node, data] of this.translationRegistry.get(element)?.nodes ?? []) {
      for (const d of data.markers ?? [data]) all.push({ ...d, from: node });
    }
    const resolved: (NodeData & { from: Node; to: Target })[] = [];
    for (const d of all) {
      const to = this.session?.resolve(d.inst ?? "");
      if (to) resolved.push({ ...d, to });
      else
        console.warn(
          `[@comvi/editor] "${d.ns}:${d.key}" names instance "${d.inst}", which is not on the page or not unique; it cannot be edited here.`,
        );
    }
    if (target && target !== element) {
      const enclosing = resolved.filter((d) => d.close && inPair(d.from, d.close, target));
      if (enclosing.length > 0) {
        // The innermost: the one that opens last.
        return [
          enclosing.reduce((a, b) =>
            a.from.compareDocumentPosition(b.from) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a,
          ),
        ];
      }
    }
    return resolved;
  }

  private handleElementClick = (element: Element, target?: Node): void => {
    const nodeDataArray = this.candidates(element, target);

    if (nodeDataArray.length > 1) {
      const keyData = nodeDataArray.map((nodeData) => ({
        inst: nodeData.inst,
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
            (selectedKey, selectedNs, selectedInst) => {
              const picked = nodeDataArray.find(
                (d) => d.key === selectedKey && d.ns === selectedNs && d.inst === selectedInst,
              );
              if (!this.stopped && picked)
                showModal(selectedKey, selectedNs, this.instanceId, picked.to);
            },
            "default",
            this.instanceId,
          );
        })
        .catch((error: unknown) => {
          if (!this.stopped) console.error("[@comvi/editor] Failed to load editor UI:", error);
        });
    } else if (nodeDataArray.length === 1) {
      const picked = nodeDataArray[0]!;
      void loadEditModal()
        .then(({ showModal }) => {
          if (this.stopped) return;
          showModal(picked.key, picked.ns, this.instanceId, picked.to);
        })
        .catch((error: unknown) => {
          if (!this.stopped) console.error("[@comvi/editor] Failed to load editor UI:", error);
        });
    }
  };

  constructor(options?: TranslationSystemOptions, session?: Session) {
    this.instanceId = `core-${++instanceCounter}`;
    this.options = {
      targetElement: options?.targetElement || document,
      tagAttributes: options?.tagAttributes || TAG_ATTRIBUTES,
    };

    if (session) {
      this.session = session;
      sessions.set(this.instanceId, session);
    }

    // EventBus wiring: DOMWatcher and TranslationRegistry emit, while
    // TranslationScanner and ElementHighlighter only listen.
    this.eventBus = new EventBus();

    this.elementHighlighter = new ElementHighlighter(this.eventBus, this.handleElementClick, {
      debug: options?.debug,
      highlightStyle: options?.highlightStyle,
      // A frame names its namespace as core looked it up: `default` unless the app chose one.
      defaultNs: "default",
    });

    this.translationRegistry = new TranslationRegistry(this.eventBus);

    this.domWatcher = new DOMWatcher(this.eventBus, this.options);

    this.translationScanner = new TranslationScanner(
      this.eventBus,
      this.translationRegistry,
      this.options,
    );

    // Context collection is OFF in 0.8 (lot 8, owner D4): the collector never starts, so no
    // request goes to /context/handshake or /context/usages. Where its control lives, and
    // whether it returns, is an open product question before the 0.8 release.
    this.collector = new Collector(this.eventBus, this.translationRegistry, this.instanceId, {
      enabled: false,
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

    // Cleanup UI only when its lazy chunk has been loaded, and only the UI
    // this instance opened: another active Core may own what is on screen.
    editModalModule?.cleanup(this.instanceId);
    keySelectorModule?.cleanup(this.instanceId);

    sessions.delete(this.instanceId);
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public getRegistry(): TranslationRegistry {
    return this.translationRegistry;
  }
}
