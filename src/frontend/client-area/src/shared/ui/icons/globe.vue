<template>
  <div>
    <svg
      v-if="iconSize === '20'"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 18C14.7581 18 18 14.7581 18 10C18 5.24185 14.7581 2 10 2C5.24185 2 2 5.24185 2 10C2 14.7581 5.24185 18 10 18Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M2.5 10H17.5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M10 2C12.0844 4.28196 13.0606 6.91003 13.125 10C13.0606 13.09 12.0844 15.718 10 18C7.9156 15.718 6.93937 13.09 6.875 10C6.93937 6.91003 7.9156 4.28196 10 2Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>

    <svg
      v-else
      fill="none"
      :height="height"
      viewBox="-0.5 -0.5 21 21"
      :width="width"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- The paths are drawn on a 20 px grid: the view box scales it so the globe is ~20 px in the 24 px box, as the other line icons (Restore, File). -->
      <path
        d="M10 18C14.7581 18 18 14.7581 18 10C18 5.24185 14.7581 2 10 2C5.24185 2 2 5.24185 2 10C2 14.7581 5.24185 18 10 18Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M2.5 10H17.5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M10 2C12.0844 4.28196 13.0606 6.91003 13.125 10C13.0606 13.09 12.0844 15.718 10 18C7.9156 15.718 6.93937 13.09 6.875 10C6.93937 6.91003 7.9156 4.28196 10 2Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  </div>

</template>

<script lang="ts" setup>
  import { getCurrentInstance } from 'vue'

  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')
</script>
