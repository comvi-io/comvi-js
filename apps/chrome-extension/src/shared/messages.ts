/**
 * Message types for the extension's internal channels.
 *
 * Security note: API keys never appear in any message that crosses the
 * page/DOM boundary (bridge <-> detector). Credentials travel only between
 * popup and service worker (START_SESSION) and stay inside extension
 * contexts. Authenticated requests are proxied through the service worker
 * (API_PROXY_REQUEST), which attaches the Authorization header itself.
 */

export type MessageType =
  | "COMVI_DETECTED"
  | "COMVI_NOT_FOUND"
  | "GET_STATUS"
  | "STATUS_RESPONSE"
  | "ACTIVATE_EDITOR"
  | "DEACTIVATE_EDITOR"
  | "EDITOR_ACTIVATED"
  | "EDITOR_DEACTIVATED"
  | "DOCUMENT_READY"
  | "START_SESSION"
  | "ROLLBACK_ACTIVATION"
  | "END_SESSION"
  | "FORGET_CREDENTIALS"
  | "GET_SESSION_STATUS"
  | "SESSION_STATE_CHANGED"
  | "API_PROXY_REQUEST"
  | "API_PROXY_ABORT"
  | "PING_DOCUMENT";

export interface Message {
  type: MessageType;
  payload?: unknown;
}

/**
 * What the detector found on the page (contracts/chrome-extension-proxy.json, `discovery`):
 * protocol 2 entries it can drive, only entries of a Comvi older than 0.8 (0.5–0.7 `{ v, i }`,
 * the v1 registry, the 0.7 hook), or only handles it does not know (`x.p !== 2`, another
 * `kind`). `unknown-protocol` wins over `old-protocol`; one compatible entry wins over both.
 */
export type PageSupport = "compatible" | "old-protocol" | "unknown-protocol";

/**
 * Why the editor could not be put on the page or started. The detector's own codes
 * (`csp-blocked` … `bad-version`), the page's protocol (`old-protocol`, `unknown-protocol`,
 * `no-instance`), all decided in the extension: no text from the page travels with them.
 */
export type ActivationFailureCode =
  | "csp-blocked"
  | "trusted-types"
  | "load-error"
  | "timeout"
  | "no-global"
  | "bad-version"
  | "old-protocol"
  | "unknown-protocol"
  | "no-instance";

/**
 * What the service worker tells the popup about a failed activation: a code
 * the page reported (checked against the list), or one of the worker's own —
 * `unconfirmed` (the acknowledgement did not match the pending session) and
 * `failed` (the page reported a failure without a known code). The popup words
 * every one of them itself; no text from the page travels with it.
 */
export type ActivationOutcomeCode = ActivationFailureCode | "unconfirmed" | "failed";

export interface StatusResponsePayload {
  comviDetected: boolean;
  editorActive: boolean;
  /** What the detected entries speak; absent when nothing was detected. */
  support?: PageSupport;
  /** Version the loaded editor reports about itself. */
  editorVersion?: string;
  version?: string;
  instanceCount?: number;
}

/**
 * popup -> bridge: command to activate the editor. `nonce` is the single-use
 * activation token from START_SESSION; the bridge keeps it in the isolated
 * world and attaches it to the acknowledgement — it is never dispatched into
 * the page. Everything forwarded into the page is non-secret.
 */
export interface ActivatePayload {
  apiBaseUrl: string;
  nonce?: string;
}

/** popup -> service worker: validate the key and open a pending proxy session. */
export interface StartSessionPayload {
  tabId: number;
  origin: string;
  apiKey: string;
  /** Registered popup Port lease; pending authority dies with this popup. */
  popupLeaseId: string;
}

export interface StartSessionResponse {
  ok: boolean;
  error?: string;
  /** Single-use activation nonce for the pending session. */
  nonce?: string;
}

/** popup -> service worker: authoritative session state for a tab. */
export interface SessionStatusResponse {
  active: boolean;
  pending: boolean;
  /** Cached detector state, used to render the popup without reinjection. */
  comviDetected?: boolean;
  version?: string;
  /** Cached: what the detected entries speak. */
  support?: PageSupport;
  /** Set when the worker could not determine the state (reported as inactive). */
  unavailable?: string;
}

/** service worker -> popup: authoritative lifecycle completion for one tab. */
export interface SessionStateChangedPayload extends SessionStatusResponse {
  tabId: number;
  /** Why the activation failed; the popup words the reason and the remedy. */
  code?: ActivationOutcomeCode;
}

/** bridge -> service worker: proxied API request from the editor runtime. */
export interface ApiProxyRequestPayload {
  id: string;
  path: string;
  method?: string;
  body?: string;
  keepalive?: boolean;
}

/** service worker -> bridge: proxied API response. */
export interface ApiProxyResponsePayload {
  id: string;
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  /** Set when the request failed before reaching the server. */
  networkError?: string;
}

export interface EditorActivatedPayload {
  success: boolean;
  /**
   * Why the editor could not be put on the page. Page-authored: a known
   * {@link ActivationFailureCode} only once the service worker checked it.
   * No free text from the page is carried: the popup would have to show it.
   */
  code?: string;
}

/**
 * bridge -> service worker/popup: activation acknowledgement. `nonce` is
 * attached by the bridge (extension code) from the pending ACTIVATE_EDITOR
 * command — the page-authored result itself never contains it.
 */
export interface EditorActivatedMessage extends EditorActivatedPayload {
  nonce?: string;
}
