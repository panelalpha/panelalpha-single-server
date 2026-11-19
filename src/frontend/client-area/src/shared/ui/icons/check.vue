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
      <path
        d="M9.5 3.5L5 8.5L2.5 6"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else-if="iconSize === '14'"
      fill="none"
      height="8"
      viewBox="0 0 11 8"
      width="11"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.7073 1.70711C11.0978 1.31658 11.0978 0.683417 10.7073 0.292893C10.3167 -0.0976311 9.68358 -0.0976311 9.29306 0.292893L10.7073 1.70711ZM4.12505 6.87511L3.41794 7.58222C3.80847 7.97274 4.44163 7.97274 4.83216 7.58222L4.12505 6.87511ZM1.70711 3.04295C1.31658 2.65243 0.683417 2.65243 0.292893 3.04295C-0.0976311 3.43348 -0.0976311 4.06664 0.292893 4.45717L1.70711 3.04295ZM9.29306 0.292893L3.41794 6.16801L4.83216 7.58222L10.7073 1.70711L9.29306 0.292893ZM4.83216 6.16801L1.70711 3.04295L0.292893 4.45717L3.41794 7.58222L4.83216 6.16801Z"
        :fill="iconColor"
      />
    </svg>

    <svg
      v-else-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.6667 3L5.41675 11.25L1.66675 7.5"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>

    <svg
      v-else-if="iconSize === '20'"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16.4283 5.98849L7.26164 15.1552L3.09497 10.9885"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.3"
      />
    </svg>

    <svg
      v-else
      fill="none"
      :height="height"
      viewBox="0 0 24 24"
      :width="width"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 6L9 17L4 12"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
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
