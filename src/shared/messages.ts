/**
 * Message types for communication between extension components
 */

export type MessageType =
  | "TOLKIE_DETECTED"
  | "TOLKIE_NOT_FOUND"
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

export interface TolkieDetectedPayload {
  version: string;
  instanceCount: number;
}

export interface StatusResponsePayload {
  tolkieDetected: boolean;
  editorActive: boolean;
  version?: string;
  instanceCount?: number;
}

export interface ActivatePayload {
  apiKey: string;
  cdnUrl: string;
}
