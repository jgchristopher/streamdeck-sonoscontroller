<template>
  <div class="accordion-item">
    <h2 class="accordion-header">
      <button class="accordion-button" :class="{ collapsed: !isOpen }" type="button" @click="toggle">
        {{ title }}
      </button>
    </h2>
    <div ref="bodyRef" class="accordion-collapse" :style="{ maxHeight: maxHeightStyle }">
      <div class="accordion-body">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    forceExpanded?: boolean;
  }>(),
  {
    forceExpanded: false,
  },
);

const isOpen = ref(props.forceExpanded);
const bodyRef = ref<HTMLElement | null>(null);
const maxHeightStyle = computed(() => (isOpen.value ? "none" : "0px"));

function toggle() {
  isOpen.value = !isOpen.value;
}

watch(
  () => props.forceExpanded,
  (val) => {
    isOpen.value = val;
  },
);
</script>
