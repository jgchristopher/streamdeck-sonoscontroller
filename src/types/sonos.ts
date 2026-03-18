export interface AudioEqualizer {
  bass: number;
  treble: number;
  volume: number;
}

export interface PlayingInfo {
  position: number;
  elapsedSec: number;
  durationSec: number;
  currentTrack: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtURI: string | null;
  albumArt?: string | null;
}

export interface QueueItem {
  title: string | null;
  artist: string | null;
  album: string | null;
  uri: string | null;
  albumArtURI: string | null;
}

export interface Queue {
  start: number;
  count: number;
  list: QueueItem[];
}

export interface BrowseItem {
  title: string | null;
  uri: string | null;
  metadata: string | null;
  albumArtURI: string | null;
}

export interface FavoritesResult {
  start: number;
  count: number;
  list: BrowseItem[];
}

export interface DeviceInfo {
  audioEqualizer: AudioEqualizer;
  playMode: string;
  playbackState: string;
  currentURI: string;
  muted: boolean;
  playing: PlayingInfo | null;
  debug: unknown[];
  queue: Queue | null;
}

export interface SonosGroup {
  coordinatorUUID: string;
  coordinatorHost: string;
  coordinatorPort: number;
  name: string;
  members: GroupMember[];
}

export interface GroupMember {
  uuid: string;
  zoneName: string;
  host: string | null;
  port: number | null;
}

export interface DeviceLocation {
  host: string;
  port: number;
}

export interface DeviceListEntry {
  primary: boolean;
  hostAddress: string;
  port: number;
  zoneName: string;
  isSatellite: boolean;
  idleState: string;
  uuid: string;
}

export interface DevicesResult {
  list: Record<string, DeviceListEntry>;
}

export interface SoapResponse {
  [key: string]: string;
}

export interface InputSourceMapping {
  detect: (uri: string | undefined) => boolean;
  prefix: () => string;
  suffix: () => string;
}

export interface InputSourceMappingResult {
  sourceName: string | undefined;
  generateUri: Record<string, { prefix: string; suffix: string }>;
}
