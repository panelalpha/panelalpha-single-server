<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 24 24"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <path
        d="M23 14.01V4.39463C23 2.52535 21.4847 1.01001 19.6154 1.01001H4.38462C2.51534 1.01001 1 2.52535 1 4.39463V19.6254C1 21.4947 2.51534 23.01 4.38462 23.01H8"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <circle
        cx="14.5"
        cy="15.51"
        r="4.5"
        :stroke="iconColor"
        stroke-width="2"
      />

      <path d="M1 7.01001H23.5" :stroke="iconColor" stroke-width="2" />
      <circle cx="5" cy="4.01001" :fill="iconColor" r="1" />
      <circle cx="9" cy="4.01001" :fill="iconColor" r="1" />
      <circle cx="13" cy="4.01001" :fill="iconColor" r="1" />
      <path d="M18.5 18.51L22.5 22.51" :stroke="iconColor" stroke-linecap="round" stroke-width="2" />
    </g>

    <defs>
      <clipPath :id="uid0">
        <rect fill="white" height="24" transform="translate(0 0.0100098)" width="24" />
      </clipPath>
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_11484_79396_' + _uid
</script>
