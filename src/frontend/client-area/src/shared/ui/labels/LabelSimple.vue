<template>
  <div
    class="label-simple"
    :class="[
      small ? 'label-simple--small' : '',
      dot ? 'label-simple--dot' : '',
      item.classColor,
      hasCustomDot() ? 'label-simple--custom-dot' : '',
    ]"
    :style="{ color: item.color }"
  >
    <div
      v-if="hasCustomDot()"
      class="custom-dot"
    >
      <slot />
    </div>

    {{ dot ? "" : item.title }}
  </div>
</template>

<script lang="ts" setup>
  import type { LabelChipItem } from './labels.types'
  import type { VNode } from 'vue'
  import { Comment, Fragment, Text, useSlots } from 'vue'

  defineProps<{
    // `classColor` is a text colour class (`text-success`; V2 `success--text`).
    item: LabelChipItem & { classColor?: string }
    dot?: boolean
    small?: boolean
  }>()

  const slots = useSlots()

  function hasContent (nodes: VNode[]): boolean {
    return nodes.some(node => {
      if (node.type === Comment) {
        return false
      }
      if (node.type === Fragment) {
        return Array.isArray(node.children) && hasContent(node.children as VNode[])
      }
      return node.type !== Text || String(node.children).trim() !== ''
    })
  }

  // V2 `$slots.default` was empty when the slot's `v-if`s all failed; a Vue 3 slot function exists then and renders comments
  // only, so the slot counts as content only when it renders something (otherwise the status dot would be hidden).
  // A function, not a computed: slots are not reactive.
  function hasCustomDot (): boolean {
    const slot = slots.default
    return slot ? hasContent(slot()) : false
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.label-simple {
  position: relative;
  padding-left: 18px;
  margin-right: 8px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: v.$font-size-sm;
  line-height: v.$line-height-sm;
  font-weight: v.$font-weight-normal;
  transition: opacity 0.24s ease;

  &:hover {
    opacity: 0.6;
  }

  &--dot {
    padding-left: 8px;
  }

  &--small {
    padding-left: 14px;
    font-size: v.$font-size-xs;
    line-height: v.$line-height-xs;
    font-weight: v.$font-weight-normal;
  }

  &--custom-dot {
    padding-left: 24px;
    display: flex;
    align-items: center;

    .custom-dot {
      position: absolute;
      left: 0;
      top: calc(50% - 9px);
      width: 16px;
      height: 16px;
      margin-right: 6px;
      display: flex;
      align-items: center;
    }

    &::before {
      display: none;
    }
  }

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: calc(50% - 5px);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    background-color: currentColor;
  }
}
</style>
