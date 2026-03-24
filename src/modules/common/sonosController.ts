import type {
  SonosGroup,
  GroupMember,
  DeviceLocation,
  DeviceInfo,
  DevicesResult,
  FavoritesResult,
  BrowseItem,
  Queue,
  SoapResponse,
} from "@/types/sonos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlJsonValue = string | null | Record<string, any> | XmlJsonValue[];

interface XmlJsonObject {
  "@attributes"?: Record<string, string>;
  "#text"?: string;
  [key: string]: XmlJsonValue | undefined;
}

export class SonosController {
  static BROWSE_TYPE = {
    ARTISTS: "A:ARTIST",
    ARTIST_ALBUMS: "A:ALBUMARTIST",
    ALBUMS: "A:ALBUM",
    GENRES: "A:GENRE",
    COMPOSERS: "A:COMPOSER",
    TRACKS: "A:TRACKS",
    PLAYLISTS: "A:PLAYLISTS",
    SHARES: "S:",
    SONOS_PLAYLISTS: "SQ:",
    CATEGORIES: "A:",
    SONOS_FAVORITES: "FV:2",
    RADIO_STATIONS: "R:0/0",
    RADIO_SHOWS: "R:0/1",
  } as const;

  static SOURCE_TYPE = {
    SPOTIFY: "x-sonos-spotify",
    TV: "x-sonos-htastream",
    LINE_IN: "x-rincon-stream",
    QUEUE: "x-rincon-queue",
  } as const;

  host: string | undefined;
  port: number | undefined;

  private audioIn: SonosService;
  private avTransport: SonosService;
  private deviceProperties: SonosService;
  private renderingControl: SonosService;
  private zoneGroupTopology: SonosService;
  private contentDirectory: SonosService;
  private groupRenderingControl: SonosService;
  private zoneGroupState: Document | undefined;

  constructor() {
    this.audioIn = new SonosService(this, "AudioIn");
    this.avTransport = new SonosService(this, "AVTransport", "MediaRenderer/AVTransport");
    this.deviceProperties = new SonosService(this, "DeviceProperties");
    this.renderingControl = new SonosService(this, "RenderingControl", "MediaRenderer/RenderingControl");
    this.zoneGroupTopology = new SonosService(this, "ZoneGroupTopology");
    this.contentDirectory = new SonosService(this, "ContentDirectory", "MediaServer/ContentDirectory");
    this.groupRenderingControl = new SonosService(this, "GroupRenderingControl", "MediaRenderer/GroupRenderingControl");
  }

  connect(host: string, port = 1400): void {
    this.host = host;
    this.port = port;
  }

  isConnected(): boolean {
    return !!(this.host && this.port);
  }

  async play(): Promise<SoapResponse> {
    return this.avTransport.execute("Play", { Speed: 1 });
  }

  async pause(): Promise<SoapResponse> {
    return this.avTransport.execute("Pause");
  }

  async next(): Promise<SoapResponse> {
    return this.avTransport.execute("Next");
  }

  async previous(): Promise<SoapResponse> {
    return this.avTransport.execute("Previous");
  }

  async removeAllTracksFromQueue(): Promise<SoapResponse> {
    return this.avTransport.execute("RemoveAllTracksFromQueue");
  }

  async getGroups(): Promise<SonosGroup[]> {
    const zoneGroupState = await this.getZoneGroupState();
    const jsonState = this.convertXmlToJson(zoneGroupState) as XmlJsonObject | null;
    const groups: SonosGroup[] = [];

    const rawGroups = (jsonState as XmlJsonObject | null)?.ZoneGroups as XmlJsonObject | undefined;
    const zoneGroups = rawGroups?.ZoneGroup;
    const zoneGroupArray: XmlJsonObject[] = Array.isArray(zoneGroups)
      ? zoneGroups
      : zoneGroups
        ? [zoneGroups as XmlJsonObject]
        : [];

    for (const group of zoneGroupArray) {
      const coordinatorUUID = (group["@attributes"] as Record<string, string> | undefined)?.Coordinator;
      if (!coordinatorUUID) continue;

      const members: XmlJsonObject[] = Array.isArray(group.ZoneGroupMember)
        ? (group.ZoneGroupMember as XmlJsonObject[])
        : group.ZoneGroupMember
          ? [group.ZoneGroupMember as XmlJsonObject]
          : [];

      const visibleMembers = members.filter((m) => (m["@attributes"] as Record<string, string> | undefined)?.Invisible !== "1");
      if (visibleMembers.length === 0) continue;

      const extractHostPort = (member: XmlJsonObject): DeviceLocation | null => {
        const locationUrl = (member["@attributes"] as Record<string, string> | undefined)?.Location;
        const match = locationUrl?.match(/http:\/\/([\d.]+):(\d+)/);
        return match ? { host: match[1]!, port: parseInt(match[2]!) } : null;
      };

      const coordinator = visibleMembers.find(
        (m) => (m["@attributes"] as Record<string, string> | undefined)?.UUID === coordinatorUUID,
      );
      const coordinatorLocation = coordinator ? extractHostPort(coordinator) : null;
      if (!coordinatorLocation) continue;

      const memberList: GroupMember[] = visibleMembers.map((m) => {
        const attrs = m["@attributes"] as Record<string, string>;
        const loc = extractHostPort(m);
        return {
          uuid: attrs!.UUID!,
          zoneName: attrs!.ZoneName!,
          host: loc?.host ?? null,
          port: loc?.port ?? null,
        };
      });

      const groupName = memberList.map((m) => m.zoneName).join(" + ");

      groups.push({
        coordinatorUUID,
        coordinatorHost: coordinatorLocation.host,
        coordinatorPort: coordinatorLocation.port,
        name: groupName,
        members: memberList,
      });
    }

    return groups;
  }

  resolveGroupForUUID(groups: SonosGroup[], uuid: string): SonosGroup | null {
    for (const group of groups) {
      if (group.members.some((m) => m.uuid === uuid)) {
        return group;
      }
    }
    return null;
  }

  resolveGroupByCoordinatorUUID(groups: SonosGroup[], coordinatorUUID: string): SonosGroup | null {
    return groups.find((g) => g.coordinatorUUID === coordinatorUUID) || null;
  }

  async getDeviceLocationByUUID(uuid: string): Promise<DeviceLocation> {
    const zoneGroupState = await this.getZoneGroupState();
    const jsonState = this.convertXmlToJson(zoneGroupState) as XmlJsonObject | null;

    const extractLocation = (member: XmlJsonObject): DeviceLocation | null => {
      const attrs = member["@attributes"] as Record<string, string> | undefined;
      if (!attrs?.Location) return null;
      const match = attrs.Location.match(/http:\/\/([\d.]+):(\d+)/);
      if (!match) return null;
      return { host: match[1]!, port: parseInt(match[2]!) };
    };

    const rawGroups = (jsonState as XmlJsonObject | null)?.ZoneGroups as XmlJsonObject | undefined;
    const zoneGroups = rawGroups?.ZoneGroup;
    const groupArray: XmlJsonObject[] = Array.isArray(zoneGroups)
      ? zoneGroups
      : zoneGroups
        ? [zoneGroups as XmlJsonObject]
        : [];

    for (const group of groupArray) {
      const member = group.ZoneGroupMember;
      if (Array.isArray(member)) {
        for (const m of member as XmlJsonObject[]) {
          if ((m["@attributes"] as Record<string, string> | undefined)?.UUID === uuid) {
            const loc = extractLocation(m);
            if (loc) return loc;
          }
        }
      } else if ((member as XmlJsonObject | undefined)?.["@attributes"]) {
        const m = member as XmlJsonObject;
        if ((m["@attributes"] as Record<string, string>)?.UUID === uuid) {
          const loc = extractLocation(m);
          if (loc) return loc;
        }

        const satellite = m.Satellite as XmlJsonObject | undefined;
        if (satellite && (satellite["@attributes"] as Record<string, string> | undefined)?.UUID === uuid) {
          const loc = extractLocation(satellite);
          if (loc) return loc;
        }
      }
    }

    throw new Error(`Device with UUID ${uuid} not found`);
  }

  async joinGroup(coordinatorUUID: string): Promise<SoapResponse> {
    return this.setAVTransportURI(`x-rincon:${coordinatorUUID}`);
  }

  async leaveGroup(): Promise<SoapResponse> {
    return this.avTransport.execute("BecomeCoordinatorOfStandaloneGroup", { CurrentSpeed: 1 });
  }

  async formGroupFromPreset(
    memberUUIDs: string[],
  ): Promise<{ coordinatorHost: string; coordinatorPort: number; groupMembers: { host: string; port: number }[] }> {
    if (memberUUIDs.length < 2) {
      throw new Error("A group preset requires at least 2 members");
    }

    const coordinatorUUID = memberUUIDs[0]!;

    // Check if the preset group already exists in the current topology
    const groups = await this.getGroups();
    const existingGroup = this.resolveGroupForUUID(groups, coordinatorUUID);
    if (existingGroup) {
      const existingMemberUUIDs = new Set(existingGroup.members.map((m) => m.uuid));
      const allPresent = memberUUIDs.every((uuid) => existingMemberUUIDs.has(uuid));
      const sameSize = existingGroup.members.length === memberUUIDs.length;

      if (allPresent && sameSize) {
        // Group already matches the preset, no regrouping needed
        return {
          coordinatorHost: existingGroup.coordinatorHost,
          coordinatorPort: existingGroup.coordinatorPort,
          groupMembers: existingGroup.members
            .filter((m) => m.host !== null && m.port !== null)
            .map((m) => ({ host: m.host!, port: m.port! })),
        };
      }
    }

    const coordinatorLocation = await this.getDeviceLocationByUUID(coordinatorUUID);

    // Make coordinator standalone first
    const coordController = new SonosController();
    coordController.connect(coordinatorLocation.host, coordinatorLocation.port);
    await coordController.leaveGroup();

    const groupMembers: { host: string; port: number }[] = [
      { host: coordinatorLocation.host, port: coordinatorLocation.port },
    ];

    // Join remaining members sequentially to avoid Sonos race conditions
    for (let i = 1; i < memberUUIDs.length; i++) {
      const memberLocation = await this.getDeviceLocationByUUID(memberUUIDs[i]!);
      const memberController = new SonosController();
      memberController.connect(memberLocation.host, memberLocation.port);
      await memberController.joinGroup(coordinatorUUID);
      groupMembers.push({ host: memberLocation.host, port: memberLocation.port });
    }

    return {
      coordinatorHost: coordinatorLocation.host,
      coordinatorPort: coordinatorLocation.port,
      groupMembers,
    };
  }

  async getDeviceCapabilities(): Promise<SoapResponse> {
    return this.avTransport.execute("GetDeviceCapabilities");
  }

  async getDevices({ setAsPrimary = false } = {}): Promise<DevicesResult> {
    const zoneGroupState = await this.getZoneGroupState();
    const jsonState = this.convertXmlToJson(zoneGroupState) as XmlJsonObject | null;
    const devices: DevicesResult["list"] = {};

    const extractDeviceInfo = (member: XmlJsonObject) => {
      const attrs = member["@attributes"] as Record<string, string> | undefined;
      if (!attrs) return null;
      const match = attrs.Location?.match(/http:\/\/([\d.]+):(\d+)/);
      if (!match) return null;
      return {
        primary: this.host === match[1] && setAsPrimary,
        hostAddress: match[1]!,
        port: parseInt(match[2]!),
        zoneName: attrs.ZoneName!,
        isSatellite: attrs.Invisible === "1",
        idleState: attrs.IdleState || "ACTIVE",
        uuid: attrs.UUID!,
      };
    };

    const rawGroups = (jsonState as XmlJsonObject | null)?.ZoneGroups as XmlJsonObject | undefined;
    const zoneGroups = rawGroups?.ZoneGroup;
    const groupArray: XmlJsonObject[] = Array.isArray(zoneGroups)
      ? zoneGroups
      : zoneGroups
        ? [zoneGroups as XmlJsonObject]
        : [];

    for (const group of groupArray) {
      const members = group.ZoneGroupMember;
      if (Array.isArray(members)) {
        (members as XmlJsonObject[]).forEach((member) => {
          const deviceInfo = extractDeviceInfo(member);
          if (deviceInfo) {
            devices[(member["@attributes"] as Record<string, string>)!.UUID!] = deviceInfo;
          }
        });
      } else if ((members as XmlJsonObject | undefined)?.["@attributes"]) {
        const m = members as XmlJsonObject;
        const deviceInfo = extractDeviceInfo(m);
        if (deviceInfo) {
          devices[(m["@attributes"] as Record<string, string>)!.UUID!] = deviceInfo;
        }
      }

      const member = group.ZoneGroupMember;
      if (!Array.isArray(member) && (member as XmlJsonObject | undefined)?.Satellite) {
        const sat = (member as XmlJsonObject).Satellite as XmlJsonObject | undefined;
        if (sat?.["@attributes"]) {
          const deviceInfo = extractDeviceInfo(sat);
          if (deviceInfo) {
            devices[(sat["@attributes"] as Record<string, string>)!.UUID!] = deviceInfo;
          }
        }
      }
    }

    return { list: devices };
  }

  async getDeviceInfo(getQueue = false): Promise<DeviceInfo> {
    try {
      const [transportSettings, transportInfo, muted, volume, bass, treble, positionInfo, queue] = await Promise.all([
        this.getTransportSettings(),
        this.getTransportInfo(),
        this.getMute(),
        this.getVolume(),
        this.getBass(),
        this.getTreble(),
        this.getPositionInfo(),
        getQueue ? this.getQueue() : null,
      ]);

      let playing = null;
      if (positionInfo.TrackMetaData !== "NOT_IMPLEMENTED") {
        const track = new DOMParser().parseFromString(positionInfo.TrackMetaData!, "text/xml");
        playing = {
          position: parseInt(positionInfo.RelTime!),
          elapsedSec: positionInfo.RelTime!.split(":").reduce((p, c) => p * 60 + +c, 0),
          durationSec: positionInfo.TrackDuration!.split(":").reduce((p, c) => p * 60 + +c, 0),
          currentTrack: parseInt(positionInfo.Track!) - 1,
          title: this.getElementText(track, "dc:title"),
          artist: this.getElementText(track, "dc:creator"),
          album: this.getElementText(track, "upnp:album"),
          albumArtURI: this.getAlbumArtURI(track),
        };
      }
      return {
        audioEqualizer: {
          bass: parseInt(bass.CurrentBass!),
          treble: parseInt(treble.CurrentTreble!),
          volume: parseInt(volume.CurrentVolume!),
        },
        playMode: transportSettings.PlayMode!,
        playbackState: transportInfo.CurrentTransportState!,
        currentURI: positionInfo.TrackURI!,
        muted: muted.CurrentMute === "1",
        playing,
        debug: [transportSettings, transportInfo, muted, volume, positionInfo],
        queue,
      };
    } catch (error) {
      throw new Error(`Failed to get device info: ${(error as Error).message}`);
    }
  }

  async getMediaInfo(): Promise<SoapResponse> {
    return this.avTransport.execute("GetMediaInfo");
  }

  async getMute(): Promise<SoapResponse> {
    return this.renderingControl.execute("GetMute", { Channel: "Master" });
  }

  async getGroupMute(): Promise<SoapResponse> {
    return this.groupRenderingControl.execute("GetGroupMute");
  }

  async getPositionInfo(): Promise<SoapResponse> {
    return this.avTransport.execute("GetPositionInfo");
  }

  async getTransportInfo(): Promise<SoapResponse> {
    return this.avTransport.execute("GetTransportInfo");
  }

  async getTransportSettings(): Promise<SoapResponse> {
    return this.avTransport.execute("GetTransportSettings");
  }

  async getZoneAttributes(): Promise<SoapResponse> {
    return this.deviceProperties.execute("GetZoneAttributes");
  }

  async getZoneGroupState(): Promise<Document> {
    if (this.zoneGroupState) {
      return Promise.resolve(this.zoneGroupState);
    }

    const { ZoneGroupState: state } = await this.zoneGroupTopology.execute("GetZoneGroupState");
    const zoneGroupState = new DOMParser().parseFromString(state!, "text/xml");
    this.zoneGroupState = zoneGroupState;
    return zoneGroupState;
  }

  async getZoneInfo(): Promise<SoapResponse> {
    return this.deviceProperties.execute("GetZoneInfo");
  }

  async setPlayMode(playMode: string): Promise<SoapResponse> {
    return this.avTransport.execute("SetPlayMode", { NewPlayMode: playMode });
  }

  async setLocalTransport(prefix: string, suffix?: string): Promise<SoapResponse> {
    const zoneGroupState = await this.getZoneGroupState();
    const coordinator = zoneGroupState.querySelector("ZoneGroup")!.getAttribute("Coordinator")!;
    return this.setAVTransportURI(`${prefix}:${coordinator}${suffix || ""}`);
  }

  async setAVTransportURI(uri: string, metadata?: string): Promise<SoapResponse> {
    return this.avTransport.execute("SetAVTransportURI", {
      CurrentURI: uri,
      CurrentURIMetaData: metadata || "",
    });
  }

  async setMute(mute: boolean): Promise<SoapResponse> {
    return this.renderingControl.execute("SetMute", {
      Channel: "Master",
      DesiredMute: mute ? "1" : "0",
    });
  }

  async setGroupMute(mute: boolean): Promise<SoapResponse> {
    return this.groupRenderingControl.execute("SetGroupMute", {
      DesiredMute: mute ? "1" : "0",
    });
  }

  async getBass(): Promise<SoapResponse> {
    return this.renderingControl.execute("GetBass", { Channel: "Master" });
  }

  async setBass(bass: number): Promise<SoapResponse> {
    return this.renderingControl.execute("SetBass", { DesiredBass: bass });
  }

  async getTreble(): Promise<SoapResponse> {
    return this.renderingControl.execute("GetTreble");
  }

  async setTreble(treble: number): Promise<SoapResponse> {
    return this.renderingControl.execute("SetTreble", {
      DesiredTreble: treble,
    });
  }

  async getVolume(): Promise<SoapResponse> {
    return this.renderingControl.execute("GetVolume", { Channel: "Master" });
  }

  async setVolume(volume: number): Promise<SoapResponse> {
    return this.renderingControl.execute("SetVolume", {
      Channel: "Master",
      DesiredVolume: volume,
    });
  }

  async setRelativeVolume(adjustment: number): Promise<SoapResponse> {
    return this.renderingControl.execute("SetRelativeVolume", {
      Channel: "Master",
      Adjustment: adjustment,
    });
  }

  async setServiceURI({ uri, metadata }: { uri: string; metadata: string }): Promise<SoapResponse> {
    if (uri.startsWith("x-sonosapi-stream:")) {
      return this.setAVTransportURI(uri, metadata);
    }

    const { FirstTrackNumberEnqueued: trackNr } = await this.addURIToQueue(uri, metadata);
    if (!trackNr) throw new Error(`Failed to add URI "${uri}" to queue`);

    await this.setLocalTransport("x-rincon-queue", "#0");

    return this.seek("TRACK_NR", trackNr);
  }

  async seek(unit: string, target: string | number): Promise<SoapResponse> {
    return this.avTransport.execute("Seek", { Unit: unit, Target: target });
  }

  async addURIToQueue(uri: string, metadata: string, position?: number, next?: boolean): Promise<SoapResponse> {
    return this.avTransport.execute("AddURIToQueue", {
      EnqueuedURI: uri,
      EnqueuedURIMetaData: metadata,
      DesiredFirstTrackNumberEnqueued: position || 0,
      EnqueueAsNext: next ? "1" : "0",
    });
  }

  async browse(
    type: string,
    term?: string,
    categories?: string[],
    start?: number | string,
    count?: number | string,
  ): Promise<BrowseItem[]> {
    let objectId = type;
    if (categories) objectId += "/" + categories.map((c) => encodeURIComponent(c)).join("/");
    if (term) objectId += ":" + encodeURIComponent(type);

    const { Result: result } = await this.contentDirectory.execute("Browse", {
      ObjectID: objectId,
      BrowseFlag: "BrowseDirectChildren",
      Filter: "*",
      StartingIndex: start || "0",
      RequestedCount: count || "100",
      SortCriteria: "",
    });

    const items = new DOMParser().parseFromString(result!, "text/xml");
    return [...items.querySelectorAll("item")].map((i) => ({
      title: this.getElementText(i, "dc:title"),
      uri: this.getElementText(i, "res"),
      metadata: this.getElementText(i, "r:resMD"),
      albumArtURI: this.getAlbumArtURI(i),
    }));
  }

  async getFavorites(start = 0, count = 100): Promise<FavoritesResult> {
    return this.contentDirectory
      .execute("Browse", {
        ObjectID: SonosController.BROWSE_TYPE.SONOS_FAVORITES,
        BrowseFlag: "BrowseDirectChildren",
        Filter: "*",
        StartingIndex: start.toString(),
        RequestedCount: count.toString(),
        SortCriteria: "",
      })
      .then(({ Result: result }) => {
        const items = new DOMParser().parseFromString(result!, "text/xml");
        const list = [...items.querySelectorAll("item")].map((i) => ({
          title: this.getElementText(i, "dc:title"),
          uri: this.getElementText(i, "res"),
          metadata: this.getElementText(i, "r:resMD"),
          albumArtURI: this.getAlbumArtURI(i),
        }));
        return { start, count, list };
      });
  }

  async getQueue(start = 0, count = 100): Promise<Queue> {
    return this.contentDirectory
      .execute("Browse", {
        ObjectID: "Q:0",
        BrowseFlag: "BrowseDirectChildren",
        Filter: "*",
        StartingIndex: start.toString(),
        RequestedCount: count.toString(),
        SortCriteria: "",
      })
      .then(({ Result: result }) => {
        const items = new DOMParser().parseFromString(result!, "text/xml");
        const list = [...items.querySelectorAll("item")].map((i) => ({
          title: this.getElementText(i, "dc:title"),
          artist: this.getElementText(i, "dc:creator"),
          album: this.getElementText(i, "upnp:album"),
          uri: this.getElementText(i, "res"),
          albumArtURI: this.getAlbumArtURI(i),
        }));
        return { start, count, list };
      });
  }

  getElementText(xml: Document | Element, elementName: string): string | null {
    const elements = xml.getElementsByTagName(elementName);
    return elements.length && elements[0]!.childNodes.length ? elements[0]!.childNodes[0]!.nodeValue : null;
  }

  getAlbumArtURI(metadata: Document | Element): string | null {
    let albumArtURI = this.getElementText(metadata, "upnp:albumArtURI");
    if (albumArtURI && !albumArtURI.startsWith("http")) albumArtURI = `http://${this.host}:${this.port}${albumArtURI}`;
    return albumArtURI;
  }

  convertXmlToJson(xml: Node): XmlJsonValue {
    switch (xml.nodeType) {
      case 1: {
        const obj: XmlJsonObject = {};
        const element = xml as Element;

        if (element.attributes.length > 0) {
          obj["@attributes"] = Object.fromEntries([...element.attributes].map((attr) => [attr.nodeName, attr.nodeValue!]));
        }

        [...element.childNodes].forEach((child) => {
          const nodeName = child.nodeName;
          const value = this.convertXmlToJson(child);

          if (value !== null) {
            if (nodeName === "#text") {
              if (!obj["#text"]) obj["#text"] = value as string;
            } else {
              if (nodeName in obj) {
                if (!Array.isArray(obj[nodeName])) {
                  obj[nodeName] = [obj[nodeName] as XmlJsonValue];
                }
                (obj[nodeName] as XmlJsonValue[]).push(value);
              } else {
                obj[nodeName] = value;
              }
            }
          }
        });

        return Object.keys(obj).length ? obj : null;
      }
      case 3: {
        const value = (xml as Text).nodeValue?.trim();
        return value || null;
      }
      case 4:
        return (xml as CDATASection).nodeValue?.trim() || null;

      case 8:
        return null;

      case 9:
        return this.convertXmlToJson((xml as Document).documentElement);

      case 10:
        return null;

      default:
        return null;
    }
  }
}

class SonosService {
  private sonos: SonosController;
  private name: string;
  private baseUrl: string;

  constructor(sonos: SonosController, name: string, baseUrl?: string) {
    this.sonos = sonos;
    this.name = name;
    this.baseUrl = baseUrl || name;
  }

  async execute(action: string, params?: Record<string, string | number>): Promise<SoapResponse> {
    if (!this.sonos.isConnected()) throw new Error("Not connected to sonos");

    const allParams: Record<string, string | number> = { InstanceID: 0, ...params };

    const url = `http://${this.sonos.host}:${this.sonos.port}/${this.baseUrl}/Control`;
    const soapAction = `"urn:schemas-upnp-org:service:${this.name}:1#${action}"`;
    const xmlParams = Object.keys(allParams)
      .map((key) => `<${key}>${this.escape(allParams[key]!)}</${key}>`)
      .join("");
    const request = `<?xml version="1.0" encoding="utf-8"?>
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
                <s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${this.name}:1">${xmlParams}</u:${action}></s:Body>
            </s:Envelope>`;

    const data = await fetch(url, {
      method: "POST",
      headers: {
        SOAPAction: soapAction,
        "Content-type": "text/xml; charset=utf8",
      },
      body: request,
    });
    const responseText = await data.text();
    if (!data.ok) throw new Error(responseText);

    const responseDocument = new DOMParser().parseFromString(responseText, "text/xml");
    const response: SoapResponse = {};
    responseDocument.querySelectorAll("Body>* *").forEach((node) => (response[node.nodeName] = node.textContent!));
    return response;
  }

  escape(txt: string | number): string {
    return txt
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
