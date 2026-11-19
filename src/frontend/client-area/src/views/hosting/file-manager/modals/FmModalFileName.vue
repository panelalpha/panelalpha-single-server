<template>
  <p class="fm-modal-file-name">
    {{ name }}
  </p>
</template>

<script lang="ts" setup>
  // A `<small class="text-muted">` with the
  // file name under the modal title. The name is text, never v-html. The spacing below the title belongs to the parent modal: its scoped
  // class lands on this root, so the markup stays the same as the three copies it replaces.
  defineProps<{ name: string }>()
</script>

<style lang="scss" scoped>
.fm-modal-file-name {
  color: var(--v-gray-lighten1);
  overflow-wrap: anywhere;
}
</style>
