<template>
  <div>
    <small class="text-muted d-block">Note: Devices marked with 🛰️ are satellites</small>
    <select
      size="5"
      id="sonosSpeaker"
      @change="
        (event) => {
          emit('update:modelValue', event.target.value);
          emit('selection-saved');
        }
      "
      :value="modelValue"
      class="form-select form-select-sm mb-1"
    >
      <optgroup v-if="filteredGroups.length > 0" label="Groups">
        <option
          v-for="sonosSpeaker in filteredGroups"
          v-bind:key="sonosSpeaker.uuid"
          :value="sonosSpeaker.uuid"
          :title="sonosSpeaker?.title"
          :hostAddress="sonosSpeaker?.hostAddress"
          :zoneName="sonosSpeaker?.zoneName"
        >
          {{ sonosSpeaker.title }}
        </option>
      </optgroup>
      <optgroup label="Speakers">
        <option
          v-for="sonosSpeaker in filteredSpeakers"
          v-bind:key="sonosSpeaker.uuid"
          :value="sonosSpeaker.uuid"
          :title="sonosSpeaker?.title"
          :hostAddress="sonosSpeaker?.hostAddress"
          :zoneName="sonosSpeaker?.zoneName"
        >
          {{ sonosSpeaker.title }}
        </option>
      </optgroup>
    </select>
    <input
      type="text"
      class="form-control form-control-sm"
      v-model="sonosSpeakerFilter"
      placeholder="Filter by name or Sonos Speaker ID..."
    />
  </div>
</template>
<script setup>
import { computed, ref } from "vue";
import { SonosSpeaker } from "@/modules/pi/SonosSpeaker";

const props = defineProps({
  modelValue: {
    required: true,
    type: Object,
    default: () =>
      new SonosSpeaker({
        zoneName: "",
        hostAddress: "",
        uuid: "",
        isSatellite: false,
      }),
  },
  availableSonosSpeakers: {
    required: true,
    type: [], // SonosSpeaker[]
  },
});

const emit = defineEmits(["update:modelValue", "selection-saved"]);

const sonosSpeakerFilter = ref("");

const applyFilter = (list) => {
  if (!sonosSpeakerFilter.value) return list;
  const filterLc = sonosSpeakerFilter.value.toLowerCase();
  return list.filter((s) => {
    return s.uuid.toLowerCase().indexOf(filterLc) !== -1 || s.title.toLowerCase().indexOf(filterLc) !== -1;
  });
};

const filteredGroups = computed(() => {
  return applyFilter(props.availableSonosSpeakers.filter((s) => s.targetType === "group"));
});

const filteredSpeakers = computed(() => {
  return applyFilter(props.availableSonosSpeakers.filter((s) => s.targetType !== "group"));
});
</script>
