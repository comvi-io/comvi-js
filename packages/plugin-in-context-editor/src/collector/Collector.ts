/**
 * Collector — orchestrates passive context collection inside an active ICE
 * session.
 *
 * Hard invariants this class exists to uphold:
 *   - collection lives ONLY inside an active session: constructed by `Core`,
 *     started in `Core.start()`, destroyed FIRST in `Core.stop()`.
 *   - event-driven, no polling: passes only run on trigger settle. IO-only
 *     settles are gated on the visible-key SET; mutation-class triggers force
 *     re-evaluation past the set gates (same-key signal drift), with the
 *     transport's per-item hash gate as the network authority.
 *   - every entry point is fault-isolated: a handshake rejection,
 *     network failure, or unexpected throw anywhere in a pass silently
 *     disables collection for the rest of the session and NEVER reaches the
 *     editor's critical path.
 */

import type { EventBus } from "../EventBus";
import type { TranslationRegistry } from "../TranslationRegistry";
import { isDemoMode } from "../config/api";
import { collectAllKeyRefs, collectKeyRefsForElements, enumerateVisibleTargets } from "./enumerate";
import {
  buildNeighborCandidates,
  extractConstraintSignals,
  extractSemanticSignals,
} from "./signals";
import { computeScreenGroup, readCurrentRoute, type ScreenGroupResolver } from "./screenGroup";
import { computeVisibleSetSignature, VisibleSetGate } from "./gate";
import { CollectorTriggers } from "./triggers";
import { CollectorTransport, type PassItem } from "./transport";
import { inferTargetType } from "./targetType";
import { computeObservationHash } from "./hash";
import type { Observation } from "./types";

export interface CollectorOptions {
  enabled: boolean;
  screenGroupResolver?: ScreenGroupResolver;
}

export class Collector {
  private readonly transport: CollectorTransport;
  private readonly triggers: CollectorTriggers;
  /** Pre-gate: registry key-set + screenGroup, checked BEFORE any rect measurement. */
  private readonly registryGate = new VisibleSetGate();
  /** Post-gate: the VISIBLE key-set, checked after enumeration has measured rects. */
  private readonly gate = new VisibleSetGate();
  private disabled = false;
  private destroyed = false;
  private lastPass: PassItem[] = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly registry: TranslationRegistry,
    private readonly scopeId: string,
    private readonly options: CollectorOptions,
  ) {
    this.transport = new CollectorTransport(scopeId);
    this.triggers = new CollectorTriggers(this.eventBus, this.registry, () => this.handleSettle());
  }

  /** Whether the collector is actively subscribed (for tests/debugging). */
  public isDisabled(): boolean {
    return this.disabled;
  }

  public async start(): Promise<void> {
    if (!this.options.enabled || isDemoMode(this.scopeId)) {
      return;
    }
    // `destroyed` is permanent by design (a fresh Core/Collector is created
    // per activation, so re-init is never expected) — but if one were ever
    // reused, a post-destroy start() would otherwise no-op silently. Surface
    // it instead of debugging a mysteriously-inert collector.
    if (this.destroyed) {
      console.warn(
        "[ComviInContextEditor] Collector.start() called after destroy(); this instance will not restart.",
      );
      return;
    }

    try {
      const ok = await this.transport.handshake(collectAllKeyRefs(this.registry));

      if (this.destroyed) {
        return;
      }
      if (!ok) {
        this.disabled = true;
        return;
      }

      this.triggers.start();
      if (typeof window !== "undefined") {
        window.addEventListener("pagehide", this.handlePageHide);
      }
      this.handleSettle();
    } catch (error) {
      this.disabled = true;
      console.error(
        "[ComviInContextEditor] Collector failed to start; context collection disabled for this session.",
        error,
      );
    }
  }

  public destroy(): void {
    this.destroyed = true;
    try {
      this.triggers.destroy();
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", this.handlePageHide);
      }
      if (!this.disabled) {
        this.transport.flushOnTeardown(this.lastPass);
      }
    } catch (error) {
      console.error("[ComviInContextEditor] Collector teardown failed (ignored).", error);
    }
  }

  private handlePageHide = (): void => {
    try {
      this.transport.flushOnTeardown(this.lastPass);
    } catch {
      // Never let a page-lifecycle event throw.
    }
  };

  private handleSettle(): void {
    if (this.disabled || this.destroyed) {
      return;
    }

    try {
      const rootDocument = typeof document !== "undefined" ? document : null;
      if (!rootDocument) {
        return;
      }

      const { screenGroup, modal } = computeScreenGroup(
        rootDocument,
        this.registry,
        readCurrentRoute(),
        this.options.screenGroupResolver,
      );
      // Only targets INSIDE the open dialog's subtree get the modal-suffixed
      // group; background keys visible behind it keep the plain route group.
      const modalGroup = modal ? screenGroup + "#" + modal.discriminator : null;
      const groupFor = (element: Element): string =>
        modalGroup !== null && modal!.element.contains(element) ? modalGroup : screenGroup;

      // Mutation-class triggers (DOM/attribute/text/translation/route/resize)
      // force this pass past both set-signature gates: they can change an
      // element's signals — same-key DOM swap, ARIA/container edits,
      // responsive width — without changing the visible key SET, which is all
      // the signatures see. The gates still short-circuit IO-only settles
      // (scroll churn), and the transport's per-item hash gate keeps forced
      // re-evaluations off the network when nothing actually changed.
      const forcePass = this.triggers.consumeMutationFlag();

      // Cheap pre-gate over the currently-VISIBLE key SET (the
      // IntersectionObserver-intersecting elements mapped to {ns,key}, no rect
      // access at all) before any per-element measurement. Because this is
      // visibility-sensitive, a scroll that reveals a static element changes
      // the signature and proceeds; a no-boundary-cross scroll short-circuits
      // at this cheap tier. Only if it changed (or the pass is forced) do we
      // pay for enumerateVisibleTargets's getBoundingClientRect calls
      // (restricted to the same visible subset).
      const intersecting = this.triggers.getIntersectingElements();
      const preSignature = computeVisibleSetSignature(
        collectKeyRefsForElements(this.registry, intersecting),
        modalGroup ?? screenGroup,
      );
      if (!this.registryGate.hasChanged(preSignature) && !forcePass) {
        return;
      }

      const targets = enumerateVisibleTargets(this.registry, intersecting).map((target) => ({
        ...target,
        screenGroup: groupFor(target.element),
      }));
      const signature = computeVisibleSetSignature(targets, "");
      if (!this.gate.hasChanged(signature) && !forcePass) {
        return;
      }

      const withSignals = targets.map((target) => ({
        ...target,
        semantic: extractSemanticSignals(target.element),
        constraints: extractConstraintSignals(target.element, target.rect),
      }));

      const pass: PassItem[] = withSignals.map((target) => {
        const neighbors = buildNeighborCandidates(target, withSignals);
        const { uiType, translationRole } = inferTargetType(
          target.key,
          target.semantic,
          target.constraints,
        );

        const observation: Observation = {
          namespace: target.namespace,
          key: target.key,
          screenGroup: target.screenGroup,
          uiType,
          translationRole,
          semantic: target.semantic,
          constraints: target.constraints,
          neighbors,
        };

        const localHash = computeObservationHash({
          uiType,
          translationRole,
          constraints: target.constraints,
          neighbors,
        });

        return {
          observation,
          localHash,
          readingOrderIndex: target.readingOrderIndex,
        };
      });

      this.lastPass = pass;

      void this.transport.sendPass(pass).catch((error) => {
        // Best-effort, no retry storms (deliberate): the transport records
        // delivery only on a confirmed 2xx, so a failed send stays a full-send
        // candidate and retries on the next pass (mutation-forced or
        // signature-changing) instead of needing a dedicated retry loop here.
        console.error(
          "[ComviInContextEditor] Collector pass failed to send; will retry on a later pass.",
          error,
        );
      });
    } catch (error) {
      this.disabled = true;
      console.error(
        "[ComviInContextEditor] Collector pass crashed; context collection disabled for this session.",
        error,
      );
      try {
        this.triggers.destroy();
      } catch {
        // ignore — already disabling
      }
    }
  }
}
