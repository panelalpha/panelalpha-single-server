<template>
  <svg
    fill="none"
    height="25"
    viewBox="0 0 24 25"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <path
        d="M11 4.02002H4C3.46957 4.02002 2.96086 4.23073 2.58579 4.60581C2.21071 4.98088 2 5.48959 2 6.02002V20.02C2 20.5505 2.21071 21.0592 2.58579 21.4342C2.96086 21.8093 3.46957 22.02 4 22.02H18C18.5304 22.02 19.0391 21.8093 19.4142 21.4342C19.7893 21.0592 20 20.5505 20 20.02V13.02"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M18.5 2.52C18.8978 2.12218 19.4374 1.89868 20 1.89868C20.5626 1.89868 21.1022 2.12218 21.5 2.52C21.8978 2.91783 22.1213 3.45739 22.1213 4.02C22.1213 4.58261 21.8978 5.12218 21.5 5.52L12 15.02L8 16.02L9 12.02L18.5 2.52Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </g>

    <defs>
      <clipPath :id="uid0">
        <rect
          fill="white"
          height="24"
          transform="translate(0 0.0200195)"
          width="24"
        />
      </clipPath>
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_7750_3402_' + _uid
</script>
