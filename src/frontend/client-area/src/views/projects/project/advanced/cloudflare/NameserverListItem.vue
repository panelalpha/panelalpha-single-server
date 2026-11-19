<template>
  <li class="p-2 font-weight-600 heading--text">
    <span class="text-truncate">{{ item }}</span>

    <CopyTextButton :text="item" />
  </li>
</template>

<script lang="ts" setup>
  // The scoped rule is on the root `li`.
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'

  withDefaults(defineProps<{
    item: string
    index?: number
  }>(), {
    index: 0,
  })
</script>

<style lang="scss" scoped>
// The legacy selector (`ul li` with `var(--v-info-base)`) matched the item itself, so the
// rule sits on the root `li`.
li {
  padding-left: 16px;
  position: relative;
  display: flex;
  align-items: center;

  &::before {
    content: '';
    position: absolute;
    top: calc(50% - 3px);
    left: 0;
    width: 6px;
    height: 6px;
    border-radius: 100%;
    background: rgb(var(--v-theme-info));
  }
}
</style>
