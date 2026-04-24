/**
 * Message types for communication between extension components
 */

export type MessageType =
  | "COMVI_DETECTED"
  | "COMVI_NOT_FOUND"
  | "ACTIVATE_EDITOR"
  | "DEACTIVATE_EDITOR"
  | "GET_STATUS"
  | "STATUS_RESPONSE"
  | "EDITOR_ACTIVATED"
  | "EDITOR_DEACTIVATED";

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export interface ComviDetectedPayload {
  version: string;
  instanceCount: number;
}

export interface StatusResponsePayload {
  comviDetected: boolean;
  editorActive: boolean;
  version?: string;
  instanceCount?: number;
}

export interface ActivatePayload {
  apiKey: string;
  scriptUrl: string;
  apiBaseUrl: string;
}
