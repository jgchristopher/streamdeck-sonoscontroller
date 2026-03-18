import type { StreamDeck } from "@/modules/common/streamdeck";
import type { DeviceInfo } from "./sonos";

export interface ActionSettings {
  action: string;
  states: { Name: string; Image?: string }[];
  controller: string;
  uuid: string;
  title: string;
  hostAddress: string;
  zoneName: string;
  targetType: string;
  groupVolumeEnabled: boolean;
  selectedPlayModes: string[];
  selectedInputSources: string[];
  adjustVolumeIncrement: number;
  encoderAudioEqualizerTarget: string;
  displayStateBasedTitle: boolean | null;
  displayAlbumArt: boolean | null;
  displayMarqueeTitle: boolean | null;
  displayMarqueeAlbumTitle: boolean | null;
  selectedSonosFavorite: {
    title: string;
    uri: string;
    metadata: string;
    albumArtURI: string | null;
  } | null;
  currentStateIndex: number;
  marqueeWidth?: number;
  marqueePositionTop?: number;
  marqueePositionBottom?: number;
  speakerKey?: string;
  status?: {
    titleLastUpdated?: number;
    lastTitleValue?: string | null;
    lastCustomTitle?: string | null;
    lastPlayingTitle?: string | null;
    marqueeTitleTopValue?: string | null;
    marqueeTitleBottomValue?: string | null;
    albumArtURILastValue?: string | null;
    lastAudioEqualizerVolume?: number;
    lastAudioEqualizerBass?: number;
    lastAudioEqualizerTreble?: number;
    lastAudioEqualizerLayout?: string;
  };
}

export interface SpeakerState extends DeviceInfo {
  preMuteVolume?: number;
  preMuteVolumes?: Record<string, number>;
  inputSource?: string;
  currentTrack?: number;
  uuid?: string;
}

export interface ActionParams {
  inContext: string;
  inActionSettings: ActionSettings;
  inSonosSpeakerState: SpeakerState;
  inRotation?: { ticks: number } | null;
  deviceTimeoutDuration?: number;
}

export interface StateParams {
  inContext: string;
  inActionSettings: ActionSettings;
  inSonosSpeakerState: SpeakerState;
  StreamDeckConnection: StreamDeck;
}

export interface ActionResult {
  status: "SUCCESS" | "ERROR";
  completed: boolean;
  message: string;
  updatedSonosSpeakerState?: SpeakerState;
}

export interface StateResult {
  status: "SUCCESS" | "ERROR";
  completed: boolean;
  message: string;
  futureStateIndex?: number;
}

export type ActionFunction = (params: ActionParams) => Promise<ActionResult>;
export type StateFunction = (params: StateParams) => Promise<StateResult>;

export interface ActionDefinition {
  action: ActionFunction;
  state: {
    default?: StateFunction | null;
    keypad?: StateFunction | null;
    encoder?: StateFunction | null;
  };
}
