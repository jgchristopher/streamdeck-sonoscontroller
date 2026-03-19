<template>
  <div class="container-fluid">
    <div v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTED" class="clearfix mb-3">
      <h1>Sonos Speakers</h1>

      <AccordeonComponent id="presses" class="mb-2">
        <AccordeonItem title="Available Sonos Speakers">
          <SonosSelection
            class="mb-3"
            :available-sonos-speakers="availableSonosSpeakers"
            :show-satellite-speakers="showSatelliteSpeakers"
            v-model="sonosSpeaker"
            @selection-saved="saveSettings"
          ></SonosSelection>
        </AccordeonItem>
      </AccordeonComponent>
      <div class="alert alert-light" v-if="selectedSonosSpeaker">
        <div class="text-center">{{ selectedSonosSpeaker.title }}</div>
      </div>
      <div class="form-check form-switch" v-if="selectedSonosSpeaker?.targetType === 'group'">
        <input
          id="chkGroupVolume"
          v-model="groupVolumeEnabled"
          class="form-check-input"
          type="checkbox"
          @change="saveSettings"
        />
        <label class="form-check-label" for="chkGroupVolume">Apply volume/mute to entire group</label>
      </div>

      <div class="form-check form-switch" v-if="displayStateBasedTitleFor.includes(actionName)">
        <input
          id="chkButtonTitle"
          v-model="displayStateBasedTitle"
          class="form-check-input"
          type="checkbox"
          @change="saveSettings"
        />
        <label class="form-check-label" for="chkButtonTitle">Display State Based Title</label>
      </div>
      <div class="form-check form-switch" v-if="displayMarqueeTitleFor.includes(actionName)">
        <input
          id="chkButtonMarqueeTitle"
          v-model="displayMarqueeTitle"
          class="form-check-input"
          type="checkbox"
          @change="saveSettings"
        />
        <label class="form-check-label" for="chkButtonMarqueeTitle">Display Marquee Title</label>
      </div>
      <div class="form-check form-switch" v-if="displayMarqueeAlbumTitleFor.includes(actionName)">
        <input
          id="chkButtonAlbumTitle"
          v-model="displayMarqueeAlbumTitle"
          class="form-check-input"
          type="checkbox"
          @change="saveSettings"
        />
        <label class="form-check-label" for="chkButtonAlbumTitle">Display Marquee Album Title</label>
      </div>
      <div class="form-check form-switch" v-if="displayAlbumArtFor.includes(actionName)">
        <input
          id="chkButtonAlbumArt"
          v-model="displayAlbumArt"
          class="form-check-input"
          type="checkbox"
          @change="saveSettings"
        />
        <label class="form-check-label" for="chkButtonAlbumArt">Display Album Art</label>
      </div>
    </div>

    <div v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTED && isTogglePlayMode">
      <h1>Play Mode(s)</h1>
      <div class="d-flex flex-column gap-2 mb-3">
        <div v-for="option in availablePlayModes" :key="option.value" class="form-check form-switch">
          <input
            type="checkbox"
            class="form-check-input"
            :id="option.value"
            :value="option.value"
            v-model="selectedPlayModes"
            @change="saveSettings"
          />
          <label class="form-check-label" :for="option.value">
            {{ option.label }}
          </label>
        </div>
      </div>
    </div>

    <div v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTED && isToggleInputSource">
      <h1>Input Source(s)</h1>
      <div class="d-flex flex-column gap-2 mb-3">
        <div v-for="option in availableInputSources" :key="option.value" class="form-check form-switch">
          <input
            type="checkbox"
            class="form-check-input"
            :id="option.value"
            :value="option.value"
            v-model="selectedInputSources"
            @change="saveSettings"
          />
          <label class="form-check-label" :for="option.value">
            {{ option.label }}
          </label>
        </div>
      </div>
    </div>

    <div v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTED && isEncoderAudioEqualizer">
      <h1>Equalizer Target</h1>
      <div class="d-flex flex-column gap-2 mb-3">
        <select
          id="encoderAudioEqualizerTarget"
          v-model="encoderAudioEqualizerTarget"
          class="form-select form-select-sm"
          @change="saveSettings"
        >
          <option v-for="option in availableEqualizerTargets" :key="option" :value="option.toUpperCase()">
            {{ option.charAt(0).toUpperCase() + option.slice(1).toLowerCase() }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTED && isVolumeAction">
      <h1>Volume Step</h1>
      <div class="mb-3">
        <small class="text-muted d-block">Amount to adjust per button press (1-50)</small>
        <input
          id="adjustVolumeIncrement"
          v-model.number="adjustVolumeIncrement"
          class="form-control form-control-sm"
          type="number"
          min="1"
          max="50"
          @change="saveSettings"
        />
      </div>
    </div>

    <div v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTED && isPlaySonosFavorite">
      <h1>Sonos Favorite(s)</h1>
      <div class="d-flex flex-column gap-2 mb-3">
        <select class="form-select form-select-sm" v-model="sonosFavorite" @change="saveSettings">
          <option
            v-for="option in availableSonosFavorites"
            :key="option.value"
            :value="option.value"
            :metadata="option.metadata"
          >
            {{ option.title }}
          </option>
        </select>
      </div>
    </div>

    <div class="clearfix mb-3">
      <h1>Global Settings</h1>
      <AccordeonComponent id="globalSettings" class="mb-2">
        <AccordeonItem title="Global Settings" :force-expanded="sonosConnectionState !== OPERATIONAL_STATUS.CONNECTED">
          <div class="mb-3">
            <label class="form-label" for="discoverySubnet">Subnet to Scan</label>
            <small class="form-text d-block mb-1"
              >Common subnets: 192.168.1, 192.168.0, 192.168.2, 10.0.0, 10.0.1, 172.16.0</small
            >
            <div class="input-group input-group-sm mb-2">
              <input id="discoverySubnet" v-model="discoverySubnet" class="form-control" type="text" placeholder="192.168.1" />
              <button
                class="btn btn-outline-secondary"
                type="button"
                :disabled="!discoverySubnet || isDiscovering"
                @click="discoverDevices"
              >
                <span v-if="isDiscovering" aria-hidden="true" class="spinner-border spinner-border-sm" role="status"></span>
                <span>{{ isDiscovering ? "Scanning..." : "Discover" }}</span>
              </button>
            </div>
            <div v-if="discoveryError" class="alert alert-warning alert-dismissible py-1 px-2 mb-2" role="alert">
              <small>{{ discoveryError }}</small>
              <button class="btn-close p-2" type="button" @click="discoveryError = ''"></button>
            </div>

            <label class="form-label" for="primaryDeviceAddress">Primary Device Address (Discovery)</label>
            <small class="text-muted d-block">Note: This device is used to discover all other devices on the network</small>
            <input id="primaryDeviceAddress" v-model="primaryDeviceAddress" class="form-control form-control-sm" type="text" />
            <label class="form-label" for="TESTdeviceTimeoutDuration">Device Timeout Duration (Actions)</label>
            <small class="text-muted d-block">Note: This timeout is used when executing device actions (in seconds)</small>
            <input
              id="deviceTimeoutDuration"
              v-model="deviceTimeoutDuration"
              class="form-control form-control-sm"
              type="number"
            />
            <label class="form-label" for="deviceCheckInterval">Device Check Interval (Actions)</label>
            <small class="text-muted d-block"
              >Note: This interval is used to check the status of the device selected for this action (in seconds)</small
            >
            <input id="deviceCheckInterval" v-model="deviceCheckInterval" class="form-control form-control-sm" type="number" />
            <div class="form-check form-switch mt-2">
              <input id="chkShowSatellites" v-model="showSatelliteSpeakers" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="chkShowSatellites">Show Satellite Speakers</label>
            </div>
          </div>

          <div v-if="sonosError" class="alert alert-danger alert-dismissible" role="alert">
            {{ sonosError }}
            <button class="btn-close" type="button" @click="sonosError = ''"></button>
          </div>
        </AccordeonItem>
      </AccordeonComponent>
      <button
        :disabled="!isSonosSettingsComplete || sonosConnectionState === OPERATIONAL_STATUS.CONNECTING"
        class="btn btn-sm btn-primary float-end"
        v-on:click="saveGlobalSettings"
      >
        <span
          v-if="sonosConnectionState === OPERATIONAL_STATUS.CONNECTING"
          aria-hidden="true"
          class="spinner-border spinner-border-sm"
          role="status"
        ></span>
        <span>{{ sonosConnectionState === OPERATIONAL_STATUS.CONNECTED ? "Save and Reconnect" : "Save and Connect" }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import AccordeonComponent from "@/components/accordeon/BootstrapAccordeon.vue";
import AccordeonItem from "@/components/accordeon/BootstrapAccordeonItem.vue";
import { SonosController } from "@/modules/common/sonosController";
import { OPERATIONAL_STATUS } from "@/modules/plugin/SonosSpeakers";
import { SonosSpeaker } from "@/modules/pi/SonosSpeaker";
import { discoverSonosDevice } from "@/modules/pi/sonosDiscovery";
import { StreamDeck } from "@/modules/common/streamdeck";
import { computed, onMounted, ref } from "vue";
import type { Ref } from "vue";
import { Buffer } from "buffer";
import SonosSelection from "@/components/SonosSelection.vue";
import manifest from "@manifest";
import type { ManifestAction, ManifestState } from "@manifest";
import type { SonosGroup } from "@/types/sonos";
import type { OperationalStatusValue } from "@/types/speakers";

interface SonosFavoriteOption {
  title: string;
  metadata: string;
  value: string;
  albumArtURI: string | null;
}

interface LabelValue {
  value: string;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GlobalSettings = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionSettings = Record<string, any>;

const streamDeckConnection: Ref<StreamDeck | null> = ref(null);
const sonosError: Ref<string> = ref("");
const primaryDeviceAddress: Ref<string> = ref("");
const discoverySubnet: Ref<string> = ref("192.168.1");
const isDiscovering: Ref<boolean> = ref(false);
const discoveryError: Ref<string> = ref("");
const deviceCheckInterval: Ref<number> = ref(10);
const deviceTimeoutDuration: Ref<number> = ref(5);
const sonosConnectionState: Ref<OperationalStatusValue> = ref(OPERATIONAL_STATUS.DISCONNECTED);
const availableSonosSpeakers: Ref<SonosSpeaker[]> = ref([]);
const actionSettings: Ref<ActionSettings> = ref({});

// Stores selected sonos speaker UUID
const sonosSpeaker: Ref<string> = ref("");

// Stores streamdeck action UUID and controller type
const action: Ref<string> = ref("");
const actionName: Ref<string> = ref("");
const controllerType: Ref<string> = ref("");
const manifestAction: Ref<ManifestAction | undefined> = ref(undefined);

const isPlaySonosFavorite: Ref<boolean> = ref(false);
const availableSonosFavorites: Ref<SonosFavoriteOption[]> = ref([]);
const sonosFavorite: Ref<string> = ref("");

const isTogglePlayMode: Ref<boolean> = ref(false);
const selectedPlayModes: Ref<string[]> = ref([]);
const availablePlayModes: Ref<LabelValue[]> = ref([]);

const isToggleInputSource: Ref<boolean> = ref(false);
const availableInputSources: Ref<LabelValue[]> = ref([]);
const selectedInputSources: Ref<string[]> = ref([]);

const displayStateBasedTitleFor: string[] = [
  "toggle-play-mode",
  "toggle-input-source",
  "toggle-play-pause",
  "toggle-mute-unmute",
  "volume-up",
  "volume-down",
  "play-previous-track",
  "play-next-track",
];
const displayStateBasedTitle: Ref<boolean> = ref(false);

const displayAlbumArtFor: string[] = ["toggle-play-pause", "play-sonos-favorite", "currently-playing"];
const displayAlbumArt: Ref<boolean> = ref(false);

const displayMarqueeTitleFor: string[] = ["play-sonos-favorite", "currently-playing"];
const displayMarqueeTitle: Ref<boolean> = ref(false);

const displayMarqueeAlbumTitleFor: string[] = ["toggle-play-pause", "currently-playing"];
const displayMarqueeAlbumTitle: Ref<boolean> = ref(false);

const groupVolumeEnabled: Ref<boolean> = ref(true);
const showSatelliteSpeakers: Ref<boolean> = ref(false);

const isVolumeAction: Ref<boolean> = ref(false);
const adjustVolumeIncrement: Ref<number> = ref(10);

const isEncoderAudioEqualizer: Ref<boolean> = ref(false);
const availableEqualizerTargets: Ref<string[]> = ref(["volume", "bass", "treble"]);
const encoderAudioEqualizerTarget: Ref<string> = ref("");

onMounted(() => {
  window.connectElgatoStreamDeckSocket = (
    exPort: string,
    exPropertyInspectorUUID: string,
    exRegisterEvent: string,
    exInfo: string,
    exActionInfo?: string,
  ) => {
    if (!exActionInfo) return;
    streamDeckConnection.value = new StreamDeck(exPort, exPropertyInspectorUUID, exRegisterEvent, exInfo, exActionInfo);
    const exActionInfoObject = JSON.parse(exActionInfo);
    actionName.value = exActionInfoObject.action.split(".").pop();
    manifestAction.value = manifest.Actions.find((ma: ManifestAction) => ma.UUID === exActionInfoObject.action);

    action.value = exActionInfoObject.action;
    controllerType.value = exActionInfoObject.payload.controller;

    streamDeckConnection.value.on("connected", () => {
      streamDeckConnection.value!.requestGlobalSettings();
    });

    // this is called when the user clicks the save button external from the pi
    // saving in case logic is needed in the future
    // streamDeckConnection.value.on("didReceiveSettings", (inMessage) => {
    //   actionSettings.value = inMessage.payload.settings;
    // });
    // streamDeckConnection.value.on("sendToPropertyInspector", (inMessage) => {
    //   console.log(inMessage);
    // });

    streamDeckConnection.value.on("globalsettings", (inGlobalSettings: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const globalSettings = inGlobalSettings as GlobalSettings;
      if (globalSettings) {
        if (globalSettings.devices) {
          deviceCheckInterval.value = globalSettings.deviceCheckInterval;
          deviceTimeoutDuration.value = globalSettings.deviceTimeoutDuration;
          showSatelliteSpeakers.value = globalSettings.showSatelliteSpeakers ?? false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const primaryDevice = Object.values(globalSettings.devices).find((device: any) => device.primary === true) as any;
          if (primaryDevice) {
            primaryDeviceAddress.value = primaryDevice.hostAddress;
            actionSettings.value = JSON.parse(exActionInfo).payload.settings;

            sonosConnectionState.value = OPERATIONAL_STATUS.CONNECTED;
            switch (actionName.value) {
              case "toggle-play-mode":
                isTogglePlayMode.value = true;
                availablePlayModes.value = manifestAction.value!.States.map((state: ManifestState) => ({
                  value: state.Name.toUpperCase(),
                  label: state.Name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                }));
                if (actionSettings.value?.selectedPlayModes) {
                  selectedPlayModes.value = actionSettings.value.selectedPlayModes;
                } else {
                  selectedPlayModes.value = availablePlayModes.value.map((playMode) => playMode.value);
                }
                break;
              case "toggle-input-source":
                isToggleInputSource.value = true;
                availableInputSources.value = manifestAction.value!.States.map((state: ManifestState) => ({
                  value: state.Name.toUpperCase(),
                  label: state.Name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                }));
                if (actionSettings.value?.selectedInputSources) {
                  selectedInputSources.value = actionSettings.value.selectedInputSources;
                } else {
                  selectedInputSources.value = availableInputSources.value.map((inputSource) => inputSource.value);
                }
                break;
              case "volume-up":
              case "volume-down":
                isVolumeAction.value = true;
                adjustVolumeIncrement.value = actionSettings.value?.adjustVolumeIncrement || 10;
                break;
              case "encoder-audio-equalizer":
                isEncoderAudioEqualizer.value = true;
                if (actionSettings.value?.encoderAudioEqualizerTarget) {
                  encoderAudioEqualizerTarget.value = actionSettings.value.encoderAudioEqualizerTarget;
                } else {
                  encoderAudioEqualizerTarget.value = "VOLUME";
                }
                break;
              case "play-sonos-favorite":
                isPlaySonosFavorite.value = true;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                availableSonosFavorites.value = globalSettings.favorites.map((favorite: any) => ({
                  title: favorite.title,
                  metadata: Buffer.from(favorite.metadata, "utf-8").toString("base64"),
                  value: favorite.uri,
                  albumArtURI: favorite.albumArtURI,
                }));
                if (actionSettings.value?.selectedSonosFavorite) {
                  sonosFavorite.value = actionSettings.value.selectedSonosFavorite.uri;
                } else {
                  sonosFavorite.value = availableSonosFavorites.value[0]?.value ?? "";
                }
                break;
            }

            displayStateBasedTitle.value = actionSettings.value?.displayStateBasedTitle ?? false;
            displayAlbumArt.value = actionSettings.value?.displayAlbumArt ?? false;
            displayMarqueeTitle.value = actionSettings.value?.displayMarqueeTitle ?? false;
            displayMarqueeAlbumTitle.value = actionSettings.value?.displayMarqueeAlbumTitle ?? false;

            refreshAvailableSonosSpeakers({
              inDevices: globalSettings.devices,
              inGroups: globalSettings.groups || [],
              inActionSettings: actionSettings.value,
              triggerSaveSettings: !actionSettings.value || Object.keys(actionSettings.value).length === 0,
            });
          } else {
            console.log("No primary device found");
          }
        }
      }
    });
  };
});

const isSonosSettingsComplete = computed(() => {
  return primaryDeviceAddress.value;
});
const selectedSonosFavorite = computed(() =>
  availableSonosFavorites.value.find((favorite) => favorite.value === sonosFavorite.value),
);
const selectedSonosSpeaker = computed(() =>
  availableSonosSpeakers.value.find((speaker) => speaker.uuid === sonosSpeaker.value),
);

function refreshAvailableSonosSpeakers({
  inDevices,
  inGroups = [],
  inActionSettings = {},
  triggerSaveSettings = true,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inDevices: Record<string, any>;
  inGroups?: SonosGroup[];
  inActionSettings?: ActionSettings;
  triggerSaveSettings?: boolean;
}): void {
  const speakers = Object.values(inDevices)
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (device: any) =>
        new SonosSpeaker({
          zoneName: device.zoneName,
          hostAddress: device.hostAddress,
          uuid: device.uuid,
          isSatellite: device.isSatellite,
          targetType: "speaker",
        }),
    )
    .sort((a, b) =>
      a.title.toLowerCase() > b.title.toLowerCase() ? 1 : b.title.toLowerCase() > a.title.toLowerCase() ? -1 : 0,
    );

  const groupEntries = inGroups
    .filter((g) => g.members.length > 1)
    .map(
      (g) =>
        new SonosSpeaker({
          zoneName: g.name,
          hostAddress: g.coordinatorHost,
          uuid: `group:${g.coordinatorUUID}`,
          targetType: "group",
          memberCount: g.members.length,
        }),
    )
    .sort((a, b) =>
      a.title.toLowerCase() > b.title.toLowerCase() ? 1 : b.title.toLowerCase() > a.title.toLowerCase() ? -1 : 0,
    );

  availableSonosSpeakers.value = [...groupEntries, ...speakers];

  if (inActionSettings?.uuid) {
    sonosSpeaker.value = inActionSettings.uuid;
    groupVolumeEnabled.value = inActionSettings.groupVolumeEnabled ?? true;
    if (triggerSaveSettings) {
      saveSettings();
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primaryDevice = Object.values(inDevices).find((device: any) => device.primary === true) as any;
    sonosSpeaker.value = primaryDevice.uuid;
    if (triggerSaveSettings) {
      saveSettings();
    }
  }
}

async function discoverDevices(): Promise<void> {
  discoveryError.value = "";
  isDiscovering.value = true;
  try {
    const found = await discoverSonosDevice(discoverySubnet.value);
    if (found) {
      primaryDeviceAddress.value = found;
    } else {
      discoveryError.value = `No Sonos devices found on ${discoverySubnet.value}.x`;
    }
  } catch (error) {
    discoveryError.value = `Discovery failed: ${(error as Error).message}`;
  } finally {
    isDiscovering.value = false;
  }
}

async function saveGlobalSettings(): Promise<void> {
  sonosError.value = "";
  sonosConnectionState.value = OPERATIONAL_STATUS.CONNECTING;
  const $SONOS = new SonosController();
  $SONOS.connect(primaryDeviceAddress.value);

  try {
    const timeout = (sonosAction: string): Promise<never> =>
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout while ${sonosAction} after ${deviceTimeoutDuration.value} seconds`)),
          deviceTimeoutDuration.value * 1000,
        ),
      );
    const getDevices = await Promise.race([$SONOS.getDevices({ setAsPrimary: true }), timeout("getting devices")]);
    const getFavorites = await Promise.race([$SONOS.getFavorites(), timeout("getting favorites")]);
    const getGroups = await Promise.race([$SONOS.getGroups(), timeout("getting groups")]);
    sonosConnectionState.value = OPERATIONAL_STATUS.CONNECTED;
    refreshAvailableSonosSpeakers({
      inDevices: getDevices.list,
      inGroups: getGroups as SonosGroup[],
      inActionSettings: actionSettings.value,
    });
    streamDeckConnection.value!.saveGlobalSettings({
      payload: {
        devices: getDevices.list,
        groups: getGroups,
        deviceCheckInterval: deviceCheckInterval.value,
        deviceTimeoutDuration: deviceTimeoutDuration.value,
        showSatelliteSpeakers: showSatelliteSpeakers.value,
        favorites: getFavorites.list,
      },
    });
  } catch (error) {
    sonosConnectionState.value = OPERATIONAL_STATUS.DISCONNECTED;
    console.error("Failed to get devices:", (error as Error).message);
    sonosError.value = `Failed to get devices: ${(error as Error).message}`;
  }
}

function saveSettings(): void {
  actionSettings.value = {
    action: action.value,
    states: manifestAction.value?.States,
    controller: controllerType.value,
    uuid: selectedSonosSpeaker.value!.uuid,
    title: selectedSonosSpeaker.value!.title,
    hostAddress: selectedSonosSpeaker.value!.hostAddress,
    zoneName: selectedSonosSpeaker.value!.zoneName,
    targetType: selectedSonosSpeaker.value!.targetType || "speaker",
    groupVolumeEnabled: selectedSonosSpeaker.value!.targetType === "group" ? groupVolumeEnabled.value : false,
    selectedPlayModes: selectedPlayModes.value || [],
    selectedInputSources: selectedInputSources.value || [],
    adjustVolumeIncrement: adjustVolumeIncrement.value,
    encoderAudioEqualizerTarget: encoderAudioEqualizerTarget.value,
    displayStateBasedTitle: displayStateBasedTitleFor.includes(actionName.value) ? displayStateBasedTitle.value : null,
    displayAlbumArt: displayAlbumArtFor.includes(actionName.value) ? displayAlbumArt.value : null,
    displayMarqueeTitle: displayMarqueeTitleFor.includes(actionName.value) ? displayMarqueeTitle.value : null,
    displayMarqueeAlbumTitle: displayMarqueeAlbumTitleFor.includes(actionName.value) ? displayMarqueeAlbumTitle.value : null,
    selectedSonosFavorite: selectedSonosFavorite.value
      ? {
          title: selectedSonosFavorite.value.title,
          uri: selectedSonosFavorite.value.value,
          metadata: Buffer.from(selectedSonosFavorite.value.metadata, "base64").toString("utf-8"),
          albumArtURI: selectedSonosFavorite.value.albumArtURI,
        }
      : null,
  };
  streamDeckConnection.value!.saveSettings({
    actionSettings: actionSettings.value,
  });
}
</script>
