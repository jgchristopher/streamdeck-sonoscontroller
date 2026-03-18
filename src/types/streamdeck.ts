export type StreamDeckEventName =
  | "connected"
  | "didReceiveGlobalSettings"
  | "deviceDidConnect"
  | "deviceDidDisconnect"
  | "keyDown"
  | "keyUp"
  | "dialDown"
  | "dialUp"
  | "dialRotate"
  | "touchTap"
  | "systemDidWakeUp"
  | "willAppear"
  | "willDisappear"
  | "didReceiveSettings"
  | "sendToPlugin"
  | "sendToPropertyInspector"
  | "propertyInspectorDidAppear"
  | "propertyInspectorDidDisappear"
  | "titleParametersDidChange"
  | "globalsettings";

export interface StreamDeckEvent {
  event: string;
  context?: string;
  action?: string;
  device?: string;
  payload?: StreamDeckPayload;
}

export interface StreamDeckPayload {
  settings?: Record<string, unknown>;
  state?: number;
  controller?: string;
  ticks?: number;
  [key: string]: unknown;
}

export interface StreamDeckActionInfo {
  action: string;
  context: string;
  device: string;
  payload: {
    settings: Record<string, unknown>;
    controller: string;
    state?: number;
  };
}
