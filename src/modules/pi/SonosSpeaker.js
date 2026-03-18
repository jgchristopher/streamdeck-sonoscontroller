export class SonosSpeaker {
  zoneName;
  hostAddress;
  title;
  uuid;
  targetType;
  memberCount;

  constructor({ zoneName, hostAddress, isSatellite = false, uuid, targetType = "speaker", memberCount = 1 }) {
    this.zoneName = zoneName;
    this.hostAddress = hostAddress;
    this.uuid = uuid;
    this.targetType = targetType;
    this.memberCount = memberCount;

    if (targetType === "group" && memberCount > 1) {
      this.title = `${zoneName} [Group: ${memberCount}]`;
    } else {
      this.title = `${zoneName} (${hostAddress})${isSatellite ? " 🛰️" : ""}`;
    }
  }
}
