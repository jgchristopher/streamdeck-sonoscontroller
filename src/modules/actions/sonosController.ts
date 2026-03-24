import { SonosController } from "@/modules/common/sonosController";
import { Buffer } from "buffer";
import type { StreamDeck } from "@/modules/common/streamdeck";
import type {
  ActionSettings,
  SpeakerState,
  ActionResult,
  StateResult,
  ActionParams,
  StateParams,
  ActionDefinition,
} from "@/types/actions";
import type { InputSourceMappingResult } from "@/types/sonos";

// SonosController methods return SoapResponse which has dynamic string keys.
// The code checks .timedOut and .error properties at runtime, even though
// the timeout promise rejects rather than resolving. These checks are
// effectively dead code paths but are preserved to avoid behavior changes.
interface SonosActionResponse {
  [key: string]: unknown;
  timedOut?: string;
  error?: { message: string };
}

interface ActionTarget {
  host: string;
  groupMembers?: { host: string; port: number }[];
}

interface UpdateStreamDeckParams {
  inContext: string;
  inActionSettings: ActionSettings;
  inSonosSpeakerState: SpeakerState;
  inFutureStateIndex?: number;
  StreamDeckConnection: StreamDeck;
  customTitle?: string | null;
  customAlbumArt?: string | null;
}

export const sonosControllerActions: Record<string, ActionDefinition> = {
  toggleMuteUnmute: {
    action: toggle_mute_unmute_action,
    state: {
      default: toggle_mute_unmute_state,
      keypad: null,
      encoder: null,
    },
  },
  togglePlayPause: {
    action: toggle_play_pause_action,
    state: {
      default: toggle_play_pause_state,
      keypad: null,
      encoder: null,
    },
  },
  togglePlayMode: {
    action: toggle_play_mode_action,
    state: {
      default: toggle_play_mode_state,
      keypad: null,
      encoder: null,
    },
  },
  toggleInputSource: {
    action: toggle_input_source_action,
    state: {
      default: toggle_input_source_state,
      keypad: null,
      encoder: null,
    },
  },
  playNextTrack: {
    action: play_next_track_action,
    state: {
      keypad: generic_state,
    },
  },
  playPreviousTrack: {
    action: play_previous_track_action,
    state: {
      keypad: generic_state,
    },
  },
  playSonosFavorite: {
    action: play_sonos_favorite_action,
    state: {
      default: play_sonos_favorite_state,
    },
  },
  volumeUp: {
    action: volume_up_action,
    state: {
      keypad: generic_state,
    },
  },
  volumeDown: {
    action: volume_down_action,
    state: {
      keypad: generic_state,
    },
  },
  encoderAudioEqualizer: {
    action: encoder_audio_equalizer_action,
    state: {
      encoder: encoder_audio_equalizer_state,
    },
  },
  refreshSpeakerState: {
    action: refresh_speaker_state_action,
    state: {
      keypad: generic_state,
    },
  },
  currentlyPlaying: {
    action: refresh_speaker_state_action,
    state: {
      default: currently_playing_state,
    },
  },
};

/** Helper functions Start */

// Determine current source from URI
function getInputSourceMappings(uri: string | undefined): InputSourceMappingResult {
  const sourceMap: Record<
    string,
    { detect: (uri: string | undefined) => boolean; prefix: () => string; suffix: () => string }
  > = {
    TV_Input: {
      detect: () => (uri?.startsWith("x-sonos-htastream") && uri?.endsWith(":spdif")) || false,
      prefix: () => `x-sonos-htastream`,
      suffix: () => `:spdif`,
    },
    Line_In: {
      detect: () => uri?.startsWith("x-rincon-stream") || false,
      prefix: () => `x-rincon-stream`,
      suffix: () => ``,
    },
    Sonos_Queue: {
      detect: () => true, // Default fallback
      prefix: () => `x-rincon-queue`,
      suffix: () => `#0`,
    },
  };

  const [currentSource] = Object.entries(sourceMap).find(([, config]) => config.detect(uri)) || [];
  return {
    sourceName: currentSource,
    generateUri: Object.entries(sourceMap).reduce<Record<string, { prefix: string; suffix: string }>>((acc, [key, config]) => {
      acc[key.toUpperCase()] = {
        prefix: config.prefix(),
        suffix: config.suffix(),
      };
      return acc;
    }, {}),
  };
}

// Resolve the target host for an action, handling group routing.
// For group: prefixed UUIDs, returns the coordinator host and optionally
// all group member hosts for volume/mute fan-out.
// For individual speakers in a multi-member group, routes transport commands
// to the coordinator.
async function resolveActionTarget(
  inActionSettings: ActionSettings,
  { commandType = "transport" }: { commandType?: string } = {},
): Promise<ActionTarget> {
  const uuid = inActionSettings.uuid;
  const fallbackHost = inActionSettings.hostAddress;
  console.log(
    `[resolveActionTarget] uuid=${uuid}, commandType=${commandType}, fallbackHost=${fallbackHost}, groupVolumeEnabled=${inActionSettings.groupVolumeEnabled}`,
  );

  if (uuid?.startsWith("preset:")) {
    const memberUUIDs = inActionSettings.presetMemberUUIDs;
    if (memberUUIDs && memberUUIDs.length >= 2) {
      try {
        const sonosController = new SonosController();
        sonosController.connect(fallbackHost);

        if (commandType === "read") {
          // Read-only actions: just resolve the coordinator host without forming/checking groups
          const coordLocation = await sonosController.getDeviceLocationByUUID(memberUUIDs[0]!);
          return { host: coordLocation.host };
        }

        const groupResult = await sonosController.formGroupFromPreset(memberUUIDs);
        const result: ActionTarget = { host: groupResult.coordinatorHost };
        if (commandType === "volume" && inActionSettings.groupVolumeEnabled) {
          result.groupMembers = groupResult.groupMembers;
        }
        return result;
      } catch (error) {
        console.log(`[resolveActionTarget] Preset grouping failed, using direct host: ${(error as Error).message}`);
      }
    }
    return { host: fallbackHost };
  }

  if (uuid?.startsWith("group:")) {
    const coordUUID = uuid.replace("group:", "");
    try {
      const sonosController = new SonosController();
      sonosController.connect(fallbackHost);
      const groups = await sonosController.getGroups();
      console.log(`[resolveActionTarget] Found ${groups.length} groups`);
      const group = sonosController.resolveGroupByCoordinatorUUID(groups, coordUUID);
      if (group) {
        console.log(`[resolveActionTarget] Resolved group: ${group.name}, members: ${group.members.length}`);
        const result: ActionTarget = { host: group.coordinatorHost };
        if (commandType === "volume" && inActionSettings.groupVolumeEnabled) {
          result.groupMembers = group.members
            .filter((m) => m.host !== null && m.port !== null)
            .map((m) => ({ host: m.host as string, port: m.port as number }));
        }
        return result;
      }
    } catch (error) {
      console.log(`[resolveActionTarget] Group lookup failed, using direct host: ${(error as Error).message}`);
    }
    return { host: fallbackHost };
  }

  if (uuid) {
    try {
      const sonosController = new SonosController();
      sonosController.connect(fallbackHost);
      const groups = await sonosController.getGroups();
      const group = sonosController.resolveGroupForUUID(groups, uuid);
      if (group && group.members.length > 1) {
        return { host: group.coordinatorHost };
      }
    } catch (error) {
      console.log(`[resolveActionTarget] Group lookup failed, using direct host: ${(error as Error).message}`);
    }
  }

  return { host: fallbackHost };
}

// Update state and title on Stream Deck
function updateStreamDeckStateAndTitle({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  inFutureStateIndex = inActionSettings.currentStateIndex,
  StreamDeckConnection,
  customTitle = null,
  customAlbumArt = null,
}: UpdateStreamDeckParams): void {
  const currentStateIndex = inActionSettings?.currentStateIndex;
  const stateEntry = inActionSettings.states[inFutureStateIndex];
  const stateName = stateEntry?.Name ?? "";
  const marqueeWidth = inActionSettings.marqueeWidth || 10; // Default width of visible text

  customTitle =
    customTitle ||
    stateName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  inActionSettings.status = inActionSettings.status || {};
  const $NOW = new Date().getTime();

  // Only update if state has changed
  if (currentStateIndex !== inFutureStateIndex) {
    // Update state
    StreamDeckConnection.setState({
      context: inContext,
      stateIndex: inFutureStateIndex,
    });
  }

  // Update marquee title if:
  // - Title has never been updated, or
  // - More than 1 second since last update and marquee titles enabled
  if (
    (inActionSettings?.status?.titleLastUpdated === undefined ||
      $NOW - (inActionSettings?.status?.titleLastUpdated ?? 0) > 1000 ||
      inActionSettings.currentStateIndex !== inFutureStateIndex) &&
    (inActionSettings?.displayMarqueeTitle ||
      inActionSettings?.displayMarqueeAlbumTitle ||
      inActionSettings?.displayStateBasedTitle)
  ) {
    // Reset marquee position and update title if:
    // - Custom title has changed from last value, or
    // - No title has been set yet
    if (
      inActionSettings?.status?.lastTitleValue === undefined ||
      customTitle !== inActionSettings?.status?.lastCustomTitle ||
      inSonosSpeakerState?.playing?.title !== inActionSettings?.status?.lastPlayingTitle ||
      inActionSettings.currentStateIndex !== inFutureStateIndex
    ) {
      inActionSettings.status.lastCustomTitle = customTitle;
      inActionSettings.status.lastPlayingTitle = inSonosSpeakerState?.playing?.title;

      switch (true) {
        // When both marquee title and album title are enabled, but state-based title is disabled
        case inActionSettings.displayMarqueeTitle &&
          inActionSettings.displayMarqueeAlbumTitle &&
          !inActionSettings?.displayStateBasedTitle:
          if (
            customTitle !== inActionSettings?.status?.lastCustomTitle ||
            inActionSettings?.status?.marqueeTitleTopValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleTopValue = customTitle;
            inActionSettings.marqueePositionTop = 0;
          }
          if (
            inSonosSpeakerState?.playing?.title !== inActionSettings?.status?.lastPlayingTitle ||
            inActionSettings?.status?.marqueeTitleBottomValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleBottomValue = inSonosSpeakerState?.playing?.title;
            inActionSettings.marqueePositionBottom = 0;
          }
          break;

        // When state-based and marquee title are enabled, but album title is disabled
        case inActionSettings.displayStateBasedTitle &&
          inActionSettings.displayMarqueeTitle &&
          !inActionSettings?.displayMarqueeAlbumTitle:
          if (
            customTitle !== inActionSettings?.status?.lastCustomTitle ||
            inActionSettings?.status?.marqueeTitleTopValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleTopValue = customTitle;
            inActionSettings.marqueePositionTop = 0;
          }
          inActionSettings.status.marqueeTitleBottomValue = null;
          break;

        // When state-based and album title are enabled, but marquee title is disabled
        case inActionSettings.displayStateBasedTitle &&
          inActionSettings.displayMarqueeAlbumTitle &&
          !inActionSettings?.displayMarqueeTitle:
          if (
            customTitle !== inActionSettings?.status?.lastCustomTitle ||
            inActionSettings?.status?.marqueeTitleTopValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleTopValue = customTitle;
            inActionSettings.marqueePositionTop = 0;
          }
          if (
            inSonosSpeakerState?.playing?.title !== inActionSettings?.status?.lastPlayingTitle ||
            inActionSettings?.status?.marqueeTitleBottomValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleBottomValue = inSonosSpeakerState?.playing?.title;
            inActionSettings.marqueePositionBottom = 0;
          }
          break;

        // When only state-based title is enabled, but album title and marquee title are disabled
        case inActionSettings.displayStateBasedTitle &&
          !inActionSettings?.displayMarqueeAlbumTitle &&
          !inActionSettings?.displayMarqueeTitle:
          if (
            customTitle !== inActionSettings?.status?.lastCustomTitle ||
            inActionSettings?.status?.marqueeTitleTopValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleTopValue = customTitle;
            inActionSettings.marqueePositionTop = 0;
          }
          inActionSettings.status.marqueeTitleBottomValue = null;
          break;

        // When only album title is enabled, but marquee title and state-based title are disabled
        case inActionSettings.displayMarqueeAlbumTitle &&
          !inActionSettings?.displayMarqueeTitle &&
          !inActionSettings?.displayStateBasedTitle:
          if (
            inSonosSpeakerState?.playing?.title !== inActionSettings?.status?.lastPlayingTitle ||
            inActionSettings?.status?.marqueeTitleTopValue === undefined
          ) {
            inActionSettings.status.marqueeTitleTopValue = inSonosSpeakerState?.playing?.title;
            inActionSettings.marqueePositionTop = 0;
          }
          inActionSettings.status.marqueeTitleBottomValue = null;
          break;

        default:
          inActionSettings.status.marqueeTitleTopValue = null;
          inActionSettings.status.marqueeTitleBottomValue = null;
          inActionSettings.marqueePositionTop = 0;
          inActionSettings.marqueePositionBottom = 0;
          break;

        // When all three (marquee title, album title, and state-based title) are enabled
        case inActionSettings.displayMarqueeTitle &&
          inActionSettings.displayMarqueeAlbumTitle &&
          inActionSettings.displayStateBasedTitle:
          if (
            customTitle !== inActionSettings?.status?.lastCustomTitle ||
            inActionSettings?.status?.marqueeTitleTopValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleTopValue = customTitle;
            inActionSettings.marqueePositionTop = 0;
          }
          if (
            inSonosSpeakerState?.playing?.title !== inActionSettings?.status?.lastPlayingTitle ||
            inActionSettings?.status?.marqueeTitleBottomValue === undefined ||
            inActionSettings.currentStateIndex !== inFutureStateIndex
          ) {
            inActionSettings.status.marqueeTitleBottomValue = inSonosSpeakerState?.playing?.title;
            inActionSettings.marqueePositionBottom = 0;
          }
          break;
      }
    }

    let formattedTitle: string | null = inActionSettings.status.marqueeTitleTopValue ?? null;
    if (
      (inActionSettings?.displayMarqueeTitle || inActionSettings?.displayMarqueeAlbumTitle) &&
      !inActionSettings?.displayStateBasedTitle &&
      formattedTitle &&
      formattedTitle.length > marqueeWidth
    ) {
      const titleTop = formattedTitle;
      const paddedTextTop = `${titleTop}    ${titleTop}`;

      const startIndexTop = inActionSettings.marqueePositionTop ?? 0;
      const endIndexTop = startIndexTop + marqueeWidth;
      const formattedTitleTop = paddedTextTop.substring(startIndexTop, endIndexTop);

      // Increment position and reset if needed
      inActionSettings.marqueePositionTop = (inActionSettings.marqueePositionTop ?? 0) + 1;
      if ((inActionSettings.marqueePositionTop ?? 0) >= titleTop.length + 4) {
        // Reset after full scroll + padding
        inActionSettings.marqueePositionTop = 0;
      }
      formattedTitle = formattedTitleTop;
    }

    if (inActionSettings.status.marqueeTitleBottomValue) {
      const titleBottom = inActionSettings.status.marqueeTitleBottomValue;
      const paddedTextBottom = `${titleBottom}    ${titleBottom}`;
      const startIndexBottom = inActionSettings.marqueePositionBottom ?? 0;
      const endIndexBottom = startIndexBottom + marqueeWidth;
      const formattedTitleBottom = paddedTextBottom.substring(startIndexBottom, endIndexBottom);

      inActionSettings.marqueePositionBottom = (inActionSettings.marqueePositionBottom ?? 0) + 1;
      if ((inActionSettings.marqueePositionBottom ?? 0) >= titleBottom.length + 4) {
        // Reset after full scroll + padding
        inActionSettings.marqueePositionBottom = 0;
      }
      formattedTitle = `${formattedTitle}\r\n\r\n\r\n${formattedTitleBottom}`;
    }

    if (formattedTitle !== inActionSettings?.status?.lastTitleValue) {
      inActionSettings.status.lastTitleValue = formattedTitle;
      StreamDeckConnection.setTitle({ context: inContext, title: formattedTitle });
    }
    inActionSettings.status.titleLastUpdated = $NOW;
  } else if (
    !inActionSettings?.displayMarqueeTitle &&
    !inActionSettings?.displayMarqueeAlbumTitle &&
    !inActionSettings?.displayStateBasedTitle &&
    inActionSettings.status?.lastTitleValue === undefined
  ) {
    inActionSettings.status.lastTitleValue = null;
    StreamDeckConnection.setTitle({ context: inContext, title: null });
  }
  // Update album artwork on Stream Deck button if:
  // - Album art URI has never been cached, or current URI differs from cached URI
  // - Album art display setting is enabled in action settings
  // - Album art URI exists in current track metadata
  if (inActionSettings?.displayAlbumArt) {
    const albumArtURI = customAlbumArt || inSonosSpeakerState?.playing?.albumArtURI;
    if (
      inActionSettings?.status?.albumArtURILastValue === undefined ||
      inActionSettings.status.albumArtURILastValue !== albumArtURI ||
      inActionSettings.currentStateIndex !== inFutureStateIndex
    ) {
      if (albumArtURI) {
        inActionSettings.status.albumArtURILastValue = albumArtURI;
        if (albumArtURI.startsWith("http")) {
          fetch(albumArtURI)
            .then((response) => response.arrayBuffer())
            .then((buffer) => {
              const base64 = Buffer.from(buffer).toString("base64");
              StreamDeckConnection.setImage({
                context: inContext,
                image: `data:image/png;base64,${base64}`,
                state: inFutureStateIndex,
              });
            })
            .catch((error) => console.error("Error fetching albumArtURI:", error));
        } else {
          StreamDeckConnection.setImage({
            context: inContext,
            image: albumArtURI,
            state: inFutureStateIndex,
          });
        }
      } else {
        inActionSettings.status.albumArtURILastValue = null;
        StreamDeckConnection.setImage({
          context: inContext,
          image: null,
          state: inFutureStateIndex,
        });
      }
    }
  } else if (inActionSettings?.displayAlbumArt === false && inActionSettings?.status?.albumArtURILastValue === undefined) {
    inActionSettings.status.albumArtURILastValue = null;
    StreamDeckConnection.setImage({
      context: inContext,
      image: null,
      state: inFutureStateIndex,
    });
  } else if (
    inActionSettings?.displayAlbumArt === false &&
    inActionSettings?.status?.albumArtURILastValue !== undefined &&
    inActionSettings.currentStateIndex !== inFutureStateIndex
  ) {
    inActionSettings.status.albumArtURILastValue = null;
    StreamDeckConnection.setImage({
      context: inContext,
      image: null,
      state: inFutureStateIndex,
    });
  }
}

/** Helper functions End */

// Toggle mute/unmute action
export async function toggle_mute_unmute_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Toggle Mute/Unmute Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `[Toggle Mute/Unmute Action] inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const isMuted = inSonosSpeakerState?.muted || false;
    const newMuteState = !isMuted;
    const currentVolume = inSonosSpeakerState?.audioEqualizer?.volume || 0;

    const isGroupTarget = inActionSettings.uuid?.startsWith("group:") || inActionSettings.uuid?.startsWith("preset:");
    const target = await resolveActionTarget(inActionSettings, {
      commandType: isGroupTarget ? "volume" : "transport",
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout toggling mute")), deviceTimeoutDuration * 1000),
    );

    // When muting, snapshot each member's volume before sending the mute command.
    // When unmuting, restore volumes after unmuting.
    let preMuteVolumes: Record<string, number> | null = null;
    if (newMuteState && target.groupMembers && target.groupMembers.length > 0) {
      preMuteVolumes = {};
      const capturedVolumes = preMuteVolumes;
      const readPromises = target.groupMembers.map(async (member) => {
        const mc = new SonosController();
        mc.connect(member.host, member.port);
        const vol = await mc.getVolume();
        capturedVolumes[`${member.host}:${member.port}`] = parseInt(vol.CurrentVolume ?? "0");
      });
      await Promise.race([Promise.allSettled(readPromises), timeout]);
    }

    if (target.groupMembers && target.groupMembers.length > 0) {
      const mutePromises = target.groupMembers.map((member) => {
        const mc = new SonosController();
        mc.connect(member.host, member.port);
        return mc.setMute(newMuteState);
      });
      await Promise.race([Promise.allSettled(mutePromises), timeout]);

      // When unmuting with saved volumes, restore each member's volume
      if (!newMuteState && inSonosSpeakerState.preMuteVolumes) {
        const volumePromises = target.groupMembers.map((member) => {
          const mc = new SonosController();
          mc.connect(member.host, member.port);
          const savedVolume = inSonosSpeakerState.preMuteVolumes?.[`${member.host}:${member.port}`];
          if (savedVolume !== undefined) {
            return mc.setVolume(savedVolume);
          }
          return Promise.resolve();
        });
        await Promise.race([Promise.allSettled(volumePromises), timeout]);
      }
    } else {
      const sonosController = new SonosController();
      sonosController.connect(target.host);
      await Promise.race([sonosController.setMute(newMuteState), timeout]);

      if (!newMuteState && inSonosSpeakerState.preMuteVolume !== undefined) {
        await Promise.race([sonosController.setVolume(inSonosSpeakerState.preMuteVolume), timeout]);
      }
    }

    const updatedSonosSpeakerState: SpeakerState = {
      ...inSonosSpeakerState,
      muted: newMuteState,
    };

    if (newMuteState) {
      updatedSonosSpeakerState.preMuteVolume = currentVolume;
      if (preMuteVolumes) {
        updatedSonosSpeakerState.preMuteVolumes = preMuteVolumes;
      }
    } else {
      delete updatedSonosSpeakerState.preMuteVolume;
      delete updatedSonosSpeakerState.preMuteVolumes;
    }
    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Sonos mute state toggled to: ${newMuteState}`,
      updatedSonosSpeakerState,
    };
  } catch (error) {
    console.error(`${functionName} Error toggling Sonos mute state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error toggling Sonos mute state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Toggle mute/unmute state
export async function toggle_mute_unmute_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Toggle Mute/Unmute State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const stateName = inSonosSpeakerState.muted ? "Muted" : "Unmuted";
    const futureStateIndex =
      inActionSettings.states.findIndex((state) => state.Name.toLowerCase() === stateName.toLowerCase()) || 0;

    updateStreamDeckStateAndTitle({
      inContext,
      inActionSettings,
      inSonosSpeakerState,
      inFutureStateIndex: futureStateIndex,
      StreamDeckConnection,
    });

    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Sonos mute state toggled to: ${stateName}`,
      futureStateIndex,
    };
  } catch (error) {
    console.error(`${functionName} Error toggling mute state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error toggling mute state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Toggle play/pause state
export async function toggle_play_pause_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Toggle Play/Pause State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    let stateName: string;
    switch (inSonosSpeakerState.playbackState) {
      case "PLAYING":
        stateName = "Playing";
        break;
      case "PAUSED_PLAYBACK":
        stateName = "Paused";
        break;
      case "STOPPED":
        stateName = "Stopped";
        break;
      default:
        stateName = "Stopped"; // fallback state
    }

    const futureStateIndex =
      inActionSettings.states.findIndex((state) => state.Name.toLowerCase() === stateName.toLowerCase()) || 0;
    // StreamDeckConnection.setState(inContext, stateIndex);
    updateStreamDeckStateAndTitle({
      inContext,
      inActionSettings,
      inSonosSpeakerState,
      inFutureStateIndex: futureStateIndex,
      StreamDeckConnection,
    });

    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Play/pause state updated to: ${stateName}`,
      futureStateIndex,
    };
  } catch (error) {
    console.error(`${functionName} Error updating play/pause state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating play/pause state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Toggle play/pause action
export async function toggle_play_pause_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Toggle Play/Pause Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const isPlaying = inSonosSpeakerState?.playbackState === "PLAYING";

    const target = await resolveActionTarget(inActionSettings, { commandType: "transport" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout controlling playback")), deviceTimeoutDuration * 1000),
    );
    const setPlayPauseState = await Promise.race([isPlaying ? sonosController.pause() : sonosController.play(), timeout]);

    if (!setPlayPauseState.timedOut) {
      const updatedSonosSpeakerState: SpeakerState = {
        ...inSonosSpeakerState,
        playbackState: isPlaying ? "PAUSED_PLAYBACK" : "PLAYING",
      };
      clearTimeout(setPlayPauseState.timedOut as unknown as number);
      return {
        status: "SUCCESS",
        completed: true,
        message: `${functionName} Playback state toggled to: ${isPlaying ? "PAUSED_PLAYBACK" : "PLAYING"}`,
        updatedSonosSpeakerState,
      };
    }

    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error toggling Sonos playback state for context ${inContext}: Timeout`,
    };
  } catch (error) {
    console.error(`${functionName} Error toggling Sonos playback state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error toggling Sonos playback state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Toggle play mode between repeat, shuffle and normal
export async function toggle_play_mode_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Toggle Play Mode Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const currentPlayMode = inSonosSpeakerState?.playMode || "NORMAL";

    // If current play mode isn't in selected modes, start from beginning
    const currentIndex = inActionSettings.selectedPlayModes.indexOf(currentPlayMode);
    const nextMode =
      currentIndex === -1
        ? (inActionSettings.selectedPlayModes[0] ?? "NORMAL") // Start at beginning if current mode not found
        : (inActionSettings.selectedPlayModes[(currentIndex + 1) % inActionSettings.selectedPlayModes.length] ?? "NORMAL");

    const target = await resolveActionTarget(inActionSettings, { commandType: "transport" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout setting play mode")), deviceTimeoutDuration * 1000),
    );

    const setPlayModeState = await Promise.race([sonosController.setPlayMode(nextMode), timeout]);

    if (!setPlayModeState.timedOut) {
      const updatedSonosSpeakerState: SpeakerState = {
        ...inSonosSpeakerState,
        playMode: nextMode,
      };
      clearTimeout(setPlayModeState.timedOut as unknown as number);
      return {
        status: "SUCCESS",
        completed: true,
        message: `${functionName} Play mode changed to: ${nextMode}`,
        updatedSonosSpeakerState,
      };
    }
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error setting play mode for context ${inContext}: ${(setPlayModeState as SonosActionResponse).error?.message}`,
    };
  } catch (error) {
    console.error(`${functionName} Error toggling play mode for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error toggling play mode for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Update play mode state on Stream Deck
export async function toggle_play_mode_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Toggle Play Mode State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const playMode = inSonosSpeakerState.playMode || "NORMAL";
    const futureStateIndex =
      inActionSettings.states.findIndex((state) => state.Name.toUpperCase() === playMode.toUpperCase()) || 0;

    // Add short title logic
    let customTitle: string | undefined;
    switch (inActionSettings.states[futureStateIndex]?.Name) {
      case "Shuffle_NoRepeat":
        customTitle = "Shuffle 0";
        break;
      case "Shuffle_Repeat_One":
        customTitle = "Shuffle 1";
        break;
      case "Repeat_One":
        customTitle = "Repeat 1";
        break;
      case "Repeat_All":
        customTitle = "Repeat";
        break;
      default:
        break;
    }

    updateStreamDeckStateAndTitle({
      inContext,
      inActionSettings,
      inSonosSpeakerState,
      inFutureStateIndex: futureStateIndex,
      StreamDeckConnection,
      customTitle,
    });

    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Play mode state updated to: ${playMode}`,
      futureStateIndex,
    };
  } catch (error) {
    console.error(`${functionName} Error updating play mode state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating play mode state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Toggle input source for Sonos speaker
export async function toggle_input_source_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Toggle Input Source Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }

  try {
    const currentURI = inSonosSpeakerState == null ? void 0 : inSonosSpeakerState.currentURI;
    const inputSourceMappings = getInputSourceMappings(currentURI);

    // If current play mode isn't in selected modes, start from beginning
    const currentIndex = inActionSettings.selectedInputSources.indexOf((inputSourceMappings.sourceName ?? "").toUpperCase());
    const selectNextSource =
      currentIndex === -1
        ? (inActionSettings.selectedInputSources[0] ?? "") // Start at beginning if current mode not found
        : (inActionSettings.selectedInputSources[(currentIndex + 1) % inActionSettings.selectedInputSources.length] ?? "");

    const nextSource = inputSourceMappings.generateUri[selectNextSource];
    if (!nextSource) {
      return {
        status: "ERROR",
        completed: false,
        message: `${functionName} No source mapping found for ${selectNextSource}`,
      };
    }

    const target = await resolveActionTarget(inActionSettings, { commandType: "transport" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout setting input source")), deviceTimeoutDuration * 1000),
    );

    const setInputSourceState = await Promise.race([
      sonosController.setLocalTransport(nextSource.prefix, nextSource.suffix),
      timeout,
    ]);

    if (!setInputSourceState.timedOut) {
      const updatedSonosSpeakerState: SpeakerState = {
        ...inSonosSpeakerState,
        currentURI: `${nextSource.prefix}:${inSonosSpeakerState.uuid}${nextSource.suffix}`,
      };
      clearTimeout(setInputSourceState.timedOut as unknown as number);
      const setPlayModeState = await Promise.race([sonosController.play(), timeout]);
      if (!setPlayModeState.timedOut) {
        return {
          status: "SUCCESS",
          completed: true,
          message: `${functionName} Input source changed to: ${nextSource}`,
          updatedSonosSpeakerState,
        };
      }
      return {
        status: "ERROR",
        completed: false,
        message: `${functionName} Error setting input source for context ${inContext}: ${(setPlayModeState as SonosActionResponse).error?.message}`,
      };
    }
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error setting input source for context ${inContext}: ${(setInputSourceState as SonosActionResponse).error?.message}`,
    };
  } catch (error) {
    console.error(`${functionName} Error toggling input source for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error toggling input source for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Update input source state on Stream Deck
export async function toggle_input_source_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Toggle Input Source State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const currentURI = inSonosSpeakerState == null ? void 0 : inSonosSpeakerState.currentURI;
    const inputSourceMappings = getInputSourceMappings(currentURI);

    const inputSource = inSonosSpeakerState.inputSource || inActionSettings.states[0]?.Name;
    const futureStateIndex =
      inActionSettings.selectedInputSources.indexOf((inputSourceMappings.sourceName ?? "").toUpperCase()) || 0;

    // Add short title logic
    let customTitle: string | undefined;
    switch (inActionSettings.states[futureStateIndex]?.Name) {
      case "Sonos_Queue":
        customTitle = "Queue";
        break;
      case "TV_Input":
        customTitle = "TV";
        break;
      case "Line_In":
        customTitle = "Line-In";
        break;
      default:
        break;
    }

    updateStreamDeckStateAndTitle({
      inContext,
      inActionSettings,
      inSonosSpeakerState,
      inFutureStateIndex: futureStateIndex,
      StreamDeckConnection,
      customTitle,
    });

    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Input source state updated to: ${inputSource}`,
      futureStateIndex,
    };
  } catch (error) {
    console.error(`${functionName} Error updating input source state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating input source state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Play next track action
export async function play_next_track_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Play Next Track Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const target = await resolveActionTarget(inActionSettings, { commandType: "transport" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout skipping to next track")), deviceTimeoutDuration * 1000),
    );

    const nextTrackState = await Promise.race([sonosController.next(), timeout]);
    if (!nextTrackState.timedOut) {
      const updatedSonosSpeakerState: SpeakerState = {
        ...inSonosSpeakerState,
        currentTrack: (inSonosSpeakerState.currentTrack ?? 0) + 1,
      };
      clearTimeout(nextTrackState.timedOut as unknown as number);
      return {
        status: "SUCCESS",
        completed: true,
        message: `${functionName} Skipped to next track`,
        updatedSonosSpeakerState,
      };
    }
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error skipping to next track for context ${inContext}: ${(nextTrackState as SonosActionResponse).error?.message}`,
    };
  } catch (error) {
    console.error(`${functionName} Error skipping to next track for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error skipping to next track for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Play previous track action
export async function play_previous_track_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Play Previous Track Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const target = await resolveActionTarget(inActionSettings, { commandType: "transport" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout skipping to previous track")), deviceTimeoutDuration * 1000),
    );

    const previousTrackState = await Promise.race([sonosController.previous(), timeout]);
    if (!previousTrackState.timedOut) {
      const updatedSonosSpeakerState: SpeakerState = {
        ...inSonosSpeakerState,
        currentTrack: (inSonosSpeakerState.currentTrack ?? 0) - 1,
      };
      clearTimeout(previousTrackState.timedOut as unknown as number);
      return {
        status: "SUCCESS",
        completed: true,
        message: `${functionName} Skipped to previous track`,
        updatedSonosSpeakerState,
      };
    }
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error skipping to previous track for context ${inContext}: ${(previousTrackState as SonosActionResponse).error?.message}`,
    };
  } catch (error) {
    console.error(`${functionName} Error skipping to previous track for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error skipping to previous track for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Increase volume action
export async function volume_up_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Volume Up Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const target = await resolveActionTarget(inActionSettings, { commandType: "volume" });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout increasing volume")), deviceTimeoutDuration * 1000),
    );

    const increment = Number(inActionSettings.adjustVolumeIncrement) || 10;
    const currentVolume = Number(inSonosSpeakerState?.audioEqualizer?.volume) || 0;

    if (target.groupMembers) {
      await Promise.allSettled(
        target.groupMembers.map((member) => {
          const sc = new SonosController();
          sc.connect(member.host, member.port);
          return Promise.race([sc.setRelativeVolume(increment), timeout]);
        }),
      );
    } else {
      const updatedVolume = Math.min(100, currentVolume + increment);
      const sonosController = new SonosController();
      sonosController.connect(target.host);
      await Promise.race([sonosController.setVolume(updatedVolume), timeout]);
    }

    const updatedSonosSpeakerState: SpeakerState = {
      ...inSonosSpeakerState,
      audioEqualizer: {
        ...(inSonosSpeakerState?.audioEqualizer || { bass: 0, treble: 0, volume: 0 }),
        volume: Math.min(100, currentVolume + increment),
      },
    };
    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Volume increased by: ${increment}`,
      updatedSonosSpeakerState,
    };
  } catch (error) {
    console.error(`${functionName} Error increasing volume for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error increasing volume for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Decrease volume action
export async function volume_down_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Volume Down Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const target = await resolveActionTarget(inActionSettings, { commandType: "volume" });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout decreasing volume")), deviceTimeoutDuration * 1000),
    );

    const increment = Number(inActionSettings.adjustVolumeIncrement) || 10;
    const currentVolume = Number(inSonosSpeakerState?.audioEqualizer?.volume) || 0;

    if (target.groupMembers) {
      await Promise.allSettled(
        target.groupMembers.map((member) => {
          const sc = new SonosController();
          sc.connect(member.host, member.port);
          return Promise.race([sc.setRelativeVolume(-increment), timeout]);
        }),
      );
    } else {
      const updatedVolume = Math.max(0, currentVolume - increment);
      const sonosController = new SonosController();
      sonosController.connect(target.host);
      await Promise.race([sonosController.setVolume(updatedVolume), timeout]);
    }

    const updatedSonosSpeakerState: SpeakerState = {
      ...inSonosSpeakerState,
      audioEqualizer: {
        ...(inSonosSpeakerState?.audioEqualizer || { bass: 0, treble: 0, volume: 0 }),
        volume: Math.max(0, currentVolume - increment),
      },
    };
    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Volume decreased by: ${increment}`,
      updatedSonosSpeakerState,
    };
  } catch (error) {
    console.error(`${functionName} Error decreasing volume for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error decreasing volume for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Equalizer encoder action
export async function encoder_audio_equalizer_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  inRotation,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Encoder Audio Equalizer Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout setting equalizer value for ${inActionSettings.encoderAudioEqualizerTarget}`)),
        deviceTimeoutDuration * 1000,
      ),
    );

    const ticks = inRotation?.ticks ?? 0;

    switch (inActionSettings.encoderAudioEqualizerTarget) {
      case "BASS": {
        const sonosController = new SonosController();
        sonosController.connect(inActionSettings.hostAddress);
        const updatedBass = Math.min(10, Math.max(-10, inSonosSpeakerState.audioEqualizer.bass + ticks));
        const bassState = await Promise.race([sonosController.setBass(updatedBass), timeout]);
        if (!bassState.timedOut) {
          const updatedSonosSpeakerState: SpeakerState = {
            ...inSonosSpeakerState,
            audioEqualizer: {
              ...inSonosSpeakerState.audioEqualizer,
              bass: updatedBass,
            },
          };
          clearTimeout(bassState.timedOut as unknown as number);
          return {
            status: "SUCCESS",
            completed: true,
            message: `${functionName} Bass set to: ${updatedBass}`,
            updatedSonosSpeakerState,
          };
        }
        break;
      }
      case "TREBLE": {
        const sonosController = new SonosController();
        sonosController.connect(inActionSettings.hostAddress);
        const updatedTreble = Math.min(10, Math.max(-10, inSonosSpeakerState.audioEqualizer.treble + ticks));
        const trebleState = await Promise.race([sonosController.setTreble(updatedTreble), timeout]);
        if (!trebleState.timedOut) {
          const updatedSonosSpeakerState: SpeakerState = {
            ...inSonosSpeakerState,
            audioEqualizer: {
              ...inSonosSpeakerState.audioEqualizer,
              treble: updatedTreble,
            },
          };
          clearTimeout(trebleState.timedOut as unknown as number);
          return {
            status: "SUCCESS",
            completed: true,
            message: `${functionName} Treble set to: ${updatedTreble}`,
            updatedSonosSpeakerState,
          };
        }
        break;
      }
      case "VOLUME": {
        const target = await resolveActionTarget(inActionSettings, { commandType: "volume" });
        const updatedVolume = Math.min(100, Math.max(0, inSonosSpeakerState.audioEqualizer.volume + ticks));

        if (target.groupMembers) {
          await Promise.allSettled(
            target.groupMembers.map((member) => {
              const sc = new SonosController();
              sc.connect(member.host, member.port);
              return Promise.race([sc.setRelativeVolume(ticks), timeout]);
            }),
          );
        } else {
          const sonosController = new SonosController();
          sonosController.connect(target.host);
          await Promise.race([sonosController.setVolume(updatedVolume), timeout]);
        }

        const updatedSonosSpeakerState: SpeakerState = {
          ...inSonosSpeakerState,
          audioEqualizer: {
            ...inSonosSpeakerState.audioEqualizer,
            volume: updatedVolume,
          },
        };
        return {
          status: "SUCCESS",
          completed: true,
          message: `${functionName} Volume set to: ${updatedVolume}`,
          updatedSonosSpeakerState,
        };
      }
      default:
        return {
          status: "ERROR",
          completed: false,
          message: `${functionName} Invalid equalizer action for context ${inContext}`,
        };
    }
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Equalizer action timed out for context ${inContext}`,
    };
  } catch (error) {
    console.error(`${functionName} Error updating equalizer state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating equalizer state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Equalizer encoder state
export async function encoder_audio_equalizer_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Encoder Audio Equalizer State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    inActionSettings.status = inActionSettings.status || {};

    const lastAudioEqualizerVolume = inSonosSpeakerState.audioEqualizer.volume;
    const lastAudioEqualizerBass = inSonosSpeakerState.audioEqualizer.bass;
    const lastAudioEqualizerTreble = inSonosSpeakerState.audioEqualizer.treble;

    switch (inActionSettings.encoderAudioEqualizerTarget) {
      case "BASS":
        if (inActionSettings.status.lastAudioEqualizerBass !== lastAudioEqualizerBass) {
          if (inActionSettings.status.lastAudioEqualizerLayout !== "./layouts/encoder-gbar-10-10.json") {
            StreamDeckConnection.setFeedbackLayout({
              context: inContext,
              payload: {
                layout: "./layouts/encoder-gbar-10-10.json",
              },
            });
          }
          StreamDeckConnection.setFeedback({
            context: inContext,
            payload: {
              title: { value: inActionSettings.encoderAudioEqualizerTarget },
              value: { value: lastAudioEqualizerBass },
              indicator: { value: lastAudioEqualizerBass },
            },
          });
          inActionSettings.status.lastAudioEqualizerBass = lastAudioEqualizerBass;
          inActionSettings.status.lastAudioEqualizerLayout = "./layouts/encoder-gbar-10-10.json";
        }
        break;
      case "TREBLE":
        if (inActionSettings.status.lastAudioEqualizerTreble !== lastAudioEqualizerTreble) {
          if (inActionSettings.status.lastAudioEqualizerLayout !== "./layouts/encoder-gbar-10-10.json") {
            StreamDeckConnection.setFeedbackLayout({
              context: inContext,
              payload: {
                layout: "./layouts/encoder-gbar-10-10.json",
              },
            });
          }
          StreamDeckConnection.setFeedback({
            context: inContext,
            payload: {
              title: { value: inActionSettings.encoderAudioEqualizerTarget },
              value: { value: lastAudioEqualizerTreble },
              indicator: { value: lastAudioEqualizerTreble },
            },
          });
          inActionSettings.status.lastAudioEqualizerTreble = lastAudioEqualizerTreble;
          inActionSettings.status.lastAudioEqualizerLayout = "./layouts/encoder-gbar-10-10.json";
        }
        break;
      case "VOLUME":
        if (inActionSettings.status.lastAudioEqualizerVolume !== lastAudioEqualizerVolume) {
          if (inActionSettings.status.lastAudioEqualizerLayout !== "./layouts/encoder-bar-0-100.json") {
            StreamDeckConnection.setFeedbackLayout({
              context: inContext,
              payload: {
                layout: "./layouts/encoder-bar-0-100.json",
              },
            });
          }
          StreamDeckConnection.setFeedback({
            context: inContext,
            payload: {
              title: { value: inActionSettings.encoderAudioEqualizerTarget },
              value: { value: lastAudioEqualizerVolume },
              indicator: { value: lastAudioEqualizerVolume },
            },
          });
          inActionSettings.status.lastAudioEqualizerVolume = lastAudioEqualizerVolume;
          inActionSettings.status.lastAudioEqualizerLayout = "./layouts/encoder-bar-0-100.json";
        }
        break;
    }

    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Equalizer state updated for ${inActionSettings.encoderAudioEqualizerTarget}`,
      futureStateIndex: 0,
    };
  } catch (error) {
    console.error(`${functionName} Error updating equalizer state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating equalizer state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Play Sonos favorite action
export async function play_sonos_favorite_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Play Sonos Favorite Action]";
  if (!inActionSettings?.selectedSonosFavorite) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }

  try {
    const target = await resolveActionTarget(inActionSettings, { commandType: "transport" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);
    const favorite = inActionSettings.selectedSonosFavorite;

    const timeout = (sonosAction: string) =>
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout while ${sonosAction} after ${deviceTimeoutDuration} seconds`)),
          deviceTimeoutDuration * 1e3,
        ),
      );
    const removeAllTracksFromQueue = await Promise.race([
      sonosController.removeAllTracksFromQueue(),
      timeout("removing all tracks from queue"),
    ]);

    if (!removeAllTracksFromQueue.timedOut) {
      clearTimeout(removeAllTracksFromQueue.timedOut as unknown as number);
      const playFavoriteState = await Promise.race([
        sonosController.setServiceURI({
          uri: favorite.uri,
          metadata: favorite.metadata,
        }),
        timeout("playing favorite"),
      ]);

      if (!playFavoriteState.timedOut) {
        clearTimeout(playFavoriteState.timedOut as unknown as number);
        const setStartPlayingState = await Promise.race([sonosController.play(), timeout("setting start playing state")]);
        if (!setStartPlayingState.timedOut) {
          const updatedSonosSpeakerState: SpeakerState = { ...inSonosSpeakerState };
          clearTimeout(setStartPlayingState.timedOut as unknown as number);
          return {
            status: "SUCCESS",
            completed: true,
            message: `${functionName} Started playing Sonos favorite`,
            updatedSonosSpeakerState,
          };
        }
      }
    }

    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error playing Sonos favorite for context ${inContext}: ${removeAllTracksFromQueue.timedOut}`,
    };
  } catch (error) {
    console.error(`${functionName} Error playing Sonos favorite for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error playing Sonos favorite for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Play Sonos favorite state
export async function play_sonos_favorite_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Play Sonos Favorite State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }

  try {
    const albumArtURI = inActionSettings.selectedSonosFavorite?.albumArtURI || null;
    updateStreamDeckStateAndTitle({
      inContext,
      inActionSettings,
      inSonosSpeakerState,
      StreamDeckConnection,
      customTitle: inActionSettings.selectedSonosFavorite?.title,
      customAlbumArt: albumArtURI,
    });

    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Updated play favorite state`,
      futureStateIndex: 0,
    };
  } catch (error) {
    console.error(`${functionName} Error updating play favorite state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating play favorite state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Refresh device state action
export async function refresh_speaker_state_action({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  deviceTimeoutDuration = 1,
}: ActionParams): Promise<ActionResult> {
  const functionName = "[Refresh Speaker State Action]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const target = await resolveActionTarget(inActionSettings, { commandType: "read" });
    const sonosController = new SonosController();
    sonosController.connect(target.host);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout getting devices")), deviceTimeoutDuration * 1000),
    );

    const updatedSonosSpeakerState = await Promise.race([sonosController.getDeviceInfo(), timeout]);

    // The timedOut check is a legacy pattern; the timeout promise rejects
    // so this branch always executes when getDeviceInfo resolves.
    if (!(updatedSonosSpeakerState as unknown as Record<string, unknown>).timedOut) {
      clearTimeout((updatedSonosSpeakerState as unknown as Record<string, unknown>).timedOut as unknown as number);

      return {
        status: "SUCCESS",
        completed: true,
        message: `${functionName} Refreshed device state for ${inActionSettings.speakerKey}`,
        updatedSonosSpeakerState,
      };
    }
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Timed out refreshing device state for context ${inContext}`,
    };
  } catch (error) {
    console.error(`${functionName} Error refreshing device state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error refreshing device state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Currently playing state
export async function currently_playing_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Currently Playing State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  try {
    const currentURI = inSonosSpeakerState == null ? void 0 : inSonosSpeakerState.currentURI;
    const inputSourceMappings = getInputSourceMappings(currentURI);
    let customTitle: string | null = null;
    let customAlbumArt: string | null = null;
    switch (inputSourceMappings.sourceName) {
      case "TV_Input":
        customTitle = "TV";
        customAlbumArt = "./images/keys/input_tv.png";
        break;
      case "Line_In":
        customTitle = "Line In";
        customAlbumArt = "./images/keys/input_line_in.png";
        break;
      default:
        customTitle = "Queue";
        customAlbumArt = inSonosSpeakerState.playing?.albumArt ?? null;
        break;
    }

    updateStreamDeckStateAndTitle({
      inContext,
      inActionSettings,
      inSonosSpeakerState,
      StreamDeckConnection,
      customTitle,
      customAlbumArt,
    });
    return {
      status: "SUCCESS",
      completed: true,
      message: `${functionName} Updated currently playing state`,
      futureStateIndex: 0,
    };
  } catch (error) {
    console.error(`${functionName} Error updating currently playing state for context ${inContext}:`, error);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} Error updating currently playing state for context ${inContext}: ${(error as Error).message}`,
    };
  }
}

// Generic state
export async function generic_state({
  inContext,
  inActionSettings,
  inSonosSpeakerState,
  StreamDeckConnection,
}: StateParams): Promise<StateResult> {
  const functionName = "[Generic State]";
  if (!inSonosSpeakerState) {
    console.log(`${functionName} inSonosSpeakerState is undefined for context ${inContext}`);
    return {
      status: "ERROR",
      completed: false,
      message: `${functionName} inSonosSpeakerState is undefined for context ${inContext}`,
    };
  }
  const stateName = inActionSettings.states[inActionSettings.currentStateIndex]?.Name ?? "";
  const parts = stateName.split("_");
  let customTitle: string;
  if (parts.length > 1) {
    let customTitleTop = (parts[0] ?? "").charAt(0).toUpperCase() + (parts[0] ?? "").slice(1).toLowerCase();
    if (customTitleTop.length < 10) {
      customTitleTop = customTitleTop.padStart((10 + customTitleTop.length) / 2, " ").padEnd(9, " ");
    }
    let customTitleBottom = (parts[1] ?? "").charAt(0).toUpperCase() + (parts[1] ?? "").slice(1).toLowerCase();
    if (customTitleBottom.length < 10) {
      customTitleBottom = customTitleBottom.padStart((10 + customTitleBottom.length) / 2, " ").padEnd(9, " ");
    }
    customTitle = `${customTitleTop}\r\n\r\n\r\n${customTitleBottom}`;
  } else {
    customTitle = stateName.charAt(0).toUpperCase() + stateName.slice(1).toLowerCase();
    if (customTitle.length < 10) {
      customTitle = customTitle.padStart((10 + customTitle.length) / 2, " ").padEnd(9, " ");
    }
  }

  updateStreamDeckStateAndTitle({
    inContext,
    inActionSettings,
    inSonosSpeakerState,
    StreamDeckConnection,
    customTitle,
  });
  return {
    status: "SUCCESS",
    completed: true,
    message: `${functionName} Updated generic state`,
    futureStateIndex: 0,
  };
}
