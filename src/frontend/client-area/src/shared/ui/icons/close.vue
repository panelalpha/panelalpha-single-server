<template>
  <div>
    <svg
      v-if="iconSize === '12'"
      fill="none"
      height="12"
      viewBox="0 0 12 12"
      width="12"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid1 + ')'">
        <path
          d="M9 3L3 9"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M3 3L9 9"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </g>

      <defs>
        <clipPath :id="uid1">
          <rect fill="white" height="12" width="12" />
        </clipPath>
      </defs>
    </svg>

    <svg
      v-else-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid0 + ')'">
        <path
          d="M12 4L4 12"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M4 4L12 12"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />
      </g>

      <defs>
        <clipPath :id="uid0">
          <rect fill="white" height="16" width="16" />
        </clipPath>
      </defs>
    </svg>

    <svg
      v-else
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 6L6 18"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M6 6L18 18"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>
  </div>
</template>

<script lang="ts" setup>
  import { getCurrentInstance, useId } from 'vue'

  withDefaults(defineProps<{
    iconColor?: string
  }>(), {
    iconColor: 'currentColor',
  })

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_2728_6986_' + _uid
  const uid1 = 'clip0_547_8622_' + _uid
</script>
