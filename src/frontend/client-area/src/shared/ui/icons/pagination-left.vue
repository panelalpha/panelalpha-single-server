<template>
  <svg
    fill="none"
    height="25"
    viewBox="0 0 24 25"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :clip-path="'url(#' + uid0 + ')'">
      <g :clip-path="'url(#' + uid1 + ')'">
        <path
          d="M17 11.1H9.49999V9.59998C9.49999 9.46737 9.44731 9.34019 9.35355 9.24643C9.25978 9.15266 9.1326 9.09998 8.99999 9.09998H8.49999C8.43442 9.09918 8.3694 9.11211 8.30912 9.13795C8.24884 9.16378 8.19464 9.20194 8.14999 9.24998L5.64999 11.75C5.60216 11.7949 5.56404 11.8491 5.53798 11.9093C5.51192 11.9695 5.49847 12.0344 5.49847 12.1C5.49847 12.1656 5.51192 12.2305 5.53798 12.2907C5.56404 12.3509 5.60216 12.4051 5.64999 12.45L8.14999 14.95C8.19464 14.998 8.24884 15.0362 8.30912 15.062C8.3694 15.0878 8.43442 15.1008 8.49999 15.1H8.99999C9.1326 15.1 9.25978 15.0473 9.35355 14.9535C9.44731 14.8598 9.49999 14.7326 9.49999 14.6V13.1H17C17.1326 13.1 17.2598 13.0473 17.3535 12.9535C17.4473 12.8598 17.5 12.7326 17.5 12.6V11.6C17.5 11.4674 17.4473 11.3402 17.3535 11.2464C17.2598 11.1527 17.1326 11.1 17 11.1Z"
          fill="currentColor"
        />
      </g>
    </g>

    <defs>
      <clipPath :id="uid0">
        <rect
          fill="white"
          height="12"
          transform="translate(5.5 6.09998)"
          width="12"
        />
      </clipPath>

      <clipPath :id="uid1">
        <rect
          fill="white"
          height="12"
          transform="translate(5.5 6.09998)"
          width="12"
        />
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
  const uid0 = 'clip0_2695_15754_' + _uid
  const uid1 = 'clip1_2695_15754_' + _uid
</script>
