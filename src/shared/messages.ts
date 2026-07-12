/**
 * Message types for communication between extension components
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
  | "START_SESSION"
  | "END_SESSION"
  | "FORGET_CREDENTIALS"
  | "GET_SESSION_STATUS"
  | "API_PROXY_REQUEST"
  | "API_PROXY_ABORT";

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export interface StatusResponsePayload {
  comviDetected: boolean;
  editorActive: boolean;
  editorLoaded?: boolean;
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
  collectContext: boolean;
  nonce?: string;
}

/** popup -> service worker: validate the key and open a pending proxy session. */
export interface StartSessionPayload {
  tabId: number;
  origin: string;
  apiKey: string;
  collectContext: boolean;
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
  error?: string;
  instanceId?: string;
  /** Untrusted effective SDK value; may only narrow the popup telemetry opt-in. */
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
