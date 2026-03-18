<template>
  <div :id="id" class="accordion">
    <slot></slot>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  id: string;
}>();
</script>
