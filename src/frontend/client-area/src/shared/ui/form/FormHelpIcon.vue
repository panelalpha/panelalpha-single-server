<template>
  <v-tooltip
    :disabled="!text"
    location="bottom"
    open-delay="150"
    transition="custom-tooltip"
  >
    <template #activator="{ props: activatorProps }">
      <v-icon
        v-bind="activatorProps"
        :class="color"
        icon="$help"
        size="16"
      />
    </template>

    <div>
      <p class="p-3 mb-0">
        {{ text }}
      </p>
    </div>
  </v-tooltip>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    text?: string
    // V2 `gray--text text--darken-1` is the V4 `text-gray-darken-1` utility.
    color?: string
  }>(), {
    text: '',
    color: 'text-gray-darken-1',
  })
</script>
