<template>
  <div class="accordion-item">
    <h2 class="accordion-header" :id="itemId">
      <button
        class="accordion-button"
        :class="{ collapsed: !forceExpanded }"
        type="button"
        data-bs-toggle="collapse"
        :data-bs-target="'#collapse' + itemId"
        :aria-expanded="forceExpanded ? 'true' : 'false'"
        :aria-controls="'collapse' + itemId"
      >
        {{ title }}
      </button>
    </h2>
    <div
      :id="'collapse' + itemId"
      class="accordion-collapse"
      :class="{ show: forceExpanded, collapse: !forceExpanded }"
      :aria-labelledby="itemId"
      :data-bs-parent="'#' + accordeonId"
    >
      <div class="accordion-body">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
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
</script>
