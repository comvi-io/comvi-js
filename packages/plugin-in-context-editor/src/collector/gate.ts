/**
 * The visible-set change-gate (P3, hard rule 2): a pass proceeds only if the
 * set of visible (namespace,key) pairs for the current screenGroup differs
 * from the previous pass. This is a cheap, in-memory string comparison —
 * no DOM measurement happens here; callers must only call `enumerate`
 * (which does measure rects) once they already intend to check the gate.
 */

const FIELD_SEPARATOR = "::";

export function computeVisibleSetSignature(
  targets: Array<{ namespace: string; key: string; screenGroup?: string }>,
  screenGroup: string,
): string {
  const parts = targets
    .map(
      (t) =>
        t.namespace +
        FIELD_SEPARATOR +
        t.key +
        (t.screenGroup ? FIELD_SEPARATOR + t.screenGroup : ""),
    )
    .sort();
  return screenGroup + FIELD_SEPARATOR + parts.join(FIELD_SEPARATOR);
}

export class VisibleSetGate {
  private lastSignature: string | null = null;

  /** Returns true (and records the signature) only if it differs from the last call. */
  public hasChanged(signature: string): boolean {
    if (signature === this.lastSignature) {
      return false;
    }
    this.lastSignature = signature;
    return true;
  }

  public reset(): void {
    this.lastSignature = null;
  }
}
