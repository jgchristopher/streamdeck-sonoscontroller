<template>
  <div class="accordion-item">
    <h2 class="accordion-header">
      <button
        class="accordion-button"
        :class="{ collapsed: !isOpen }"
        type="button"
        @click="toggle"
      >
        {{ title }}
      </button>
    </h2>
    <div
      ref="bodyRef"
      class="accordion-collapse"
      :style="{ maxHeight: isOpen ? scrollHeight : '0px' }"
    >
      <div class="accordion-body">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";

const props = withDefaults(
  defineProps<{
    accordeonId: string;
    itemId: string;
    title: string;
    forceExpanded?: boolean;
  }>(),
  {
    forceExpanded: false,
  },
);

const isOpen = ref(props.forceExpanded);
const bodyRef = ref<HTMLElement | null>(null);
const scrollHeight = ref("0px");

function measureHeight() {
  if (bodyRef.value) {
    scrollHeight.value = bodyRef.value.scrollHeight + "px";
  }
}

function toggle() {
  isOpen.value = !isOpen.value;
  measureHeight();
}

watch(
  () => props.forceExpanded,
  async (val) => {
    isOpen.value = val;
    await nextTick();
    measureHeight();
  },
);

onMounted(async () => {
  await nextTick();
  measureHeight();
});
</script>
