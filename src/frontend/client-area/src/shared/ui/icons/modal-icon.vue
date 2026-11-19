<template>
  <svg
    fill="none"
    height="24"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <path
        d="M23 14V4.38462C23 2.51534 21.4847 1 19.6154 1H4.38462C2.51534 1 1 2.51534 1 4.38462V19.6154C1 21.4847 2.51534 23 4.38462 23H8"
        stroke="#07C07E"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <circle
        cx="14.5"
        cy="15.5"
        r="4.5"
        stroke="#07C07E"
        stroke-width="2"
      />

      <path d="M1 7H23.5" stroke="#07C07E" stroke-width="2" />
      <circle cx="5" cy="4" fill="#07C07E" r="1" />
      <circle cx="9" cy="4" fill="#07C07E" r="1" />
      <circle cx="13" cy="4" fill="#07C07E" r="1" />
      <path d="M18.5 18.5L22.5 22.5" stroke="#07C07E" stroke-linecap="round" stroke-width="2" />
    </g>

    <defs>
      <clipPath :id="uid0">
        <rect fill="white" height="24" width="24" />
      </clipPath>
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_11484_428696_' + _uid
</script>
