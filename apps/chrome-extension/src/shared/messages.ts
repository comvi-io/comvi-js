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
 * Why the page's `devtools()` hook could not put the editor on the page
 * (contracts/chrome-extension-proxy.json, `editorLoader.failureCodes`).
 */
export type EditorLoadFailureCode =
  | "csp-blocked"
  | "load-error"
  | "timeout"
  | "no-global"
  | "invalid-editor-version";

/**
 * A hook code, or the extension's own `no-loader`: the page has a Comvi i18n
 * instance but no editor and no hook to load one (@comvi/core before 0.6.0).
 */
export type ActivationFailureCode = EditorLoadFailureCode | "no-loader";

/**
 * What the service worker tells the popup about a failed activation: a code
 * the page reported (checked against the list), or one of the worker's own —
 * `unconfirmed` (the acknowledgement did not match the pending session) and
 * `failed` (the page reported a failure without a known code). The popup words
 * every one of them itself; no text from the page travels with it.
 */
export type ActivationOutcomeCode = ActivationFailureCode | "unconfirmed" | "failed";

/** The page's editor-loader hook as the detector read it. Page-authored. */
export interface EditorLoaderStatus {
  protocol: number;
  sdkVersion?: string;
  editorVersion?: string;
}

export interface StatusResponsePayload {
  comviDetected: boolean;
  editorActive: boolean;
  editorLoaded?: boolean;
  /** `null`: the detector looked and the page has no loader hook. */
  editorLoader?: EditorLoaderStatus | null;
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
  /** Cached: whether the page can supply the editor (loaded, or a loader hook). */
  editorAvailable?: boolean;
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
  instanceId?: string;
  /** Untrusted effective value derived by the editor from the site's i18n config. */
  collectContext?: boolean;
}

/**
 * bridge -> service worker/popup: activation acknowledgement. `nonce` is
 * attached by the bridge (extension code) from the pending ACTIVATE_EDITOR
 * command — the page-authored result itself never contains it.
 */
export interface EditorActivatedMessage extends EditorActivatedPayload {
  nonce?: string;
}
