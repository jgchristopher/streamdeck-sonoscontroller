export class SonosSpeaker {
  zoneName: string;
  hostAddress: string;
  title: string;
  uuid: string;
  targetType: string;
  memberCount: number;
  isSatellite: boolean;

  constructor({
    zoneName,
    hostAddress,
    isSatellite = false,
    uuid,
    targetType = "speaker",
    memberCount = 1,
  }: {
    zoneName: string;
    hostAddress: string;
    isSatellite?: boolean;
    uuid: string;
    targetType?: string;
    memberCount?: number;
  }) {
    this.zoneName = zoneName;
    this.hostAddress = hostAddress;
    this.uuid = uuid;
    this.targetType = targetType;
    this.memberCount = memberCount;
    this.isSatellite = isSatellite;

    if (targetType === "preset") {
      this.title = `${zoneName} [Preset: ${memberCount}]`;
    } else if (targetType === "group" && memberCount > 1) {
      this.title = `${zoneName} [Group: ${memberCount}]`;
    } else {
      this.title = `${zoneName} (${hostAddress})${isSatellite ? " \u{1F6F0}\uFE0F" : ""}`;
    }
  }
}
