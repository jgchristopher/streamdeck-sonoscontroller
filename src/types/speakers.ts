import type { SpeakerState } from "./actions";

export const OPERATIONAL_STATUS_VALUES = {
  UNINITIALIZED: "UNINITIALIZED",
  UPDATING: "UPDATING",
  UPDATED: "UPDATED",
  CONNECTED: "CONNECTED",
  CONNECTING: "CONNECTING",
  DISCONNECTED: "DISCONNECTED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type OperationalStatusValue = (typeof OPERATIONAL_STATUS_VALUES)[keyof typeof OPERATIONAL_STATUS_VALUES];

export interface Speaker {
  contexts: string[];
  operationalStatus: OperationalStatusValue;
  state: SpeakerState | Record<string, never>;
  updateAttempts: number[];
  lastChecked: number;
  lastUpdated: number;
}

export interface BaseOperationResponse {
  status: "SUCCESS" | "ERROR";
  message: string;
  completed: boolean;
}

export interface SpeakerResponse extends BaseOperationResponse {
  secondsLastChecked?: number;
  contexts?: string[];
  operationalStatus?: OperationalStatusValue;
  state?: SpeakerState | Record<string, never>;
  updateAttempts?: number[];
  lastChecked?: number;
  lastUpdated?: number;
  UUID?: string;
  UUIDs?: string[];
}
