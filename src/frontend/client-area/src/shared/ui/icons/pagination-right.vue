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
          d="M17.35 11.75L14.85 9.24998C14.8054 9.20194 14.7511 9.16378 14.6909 9.13795C14.6306 9.11211 14.5656 9.09918 14.5 9.09998H14C13.8674 9.09998 13.7402 9.15266 13.6464 9.24643C13.5527 9.34019 13.5 9.46737 13.5 9.59998V11.1H6C5.86739 11.1 5.74021 11.1527 5.64645 11.2464C5.55268 11.3402 5.5 11.4674 5.5 11.6V12.6C5.5 12.7326 5.55268 12.8598 5.64645 12.9535C5.74021 13.0473 5.86739 13.1 6 13.1H13.5V14.6C13.5 14.7326 13.5527 14.8598 13.6464 14.9535C13.7402 15.0473 13.8674 15.1 14 15.1H14.5C14.5656 15.1008 14.6306 15.0878 14.6909 15.062C14.7511 15.0362 14.8054 14.998 14.85 14.95L17.35 12.45C17.3978 12.4051 17.436 12.3509 17.462 12.2907C17.4881 12.2305 17.5015 12.1656 17.5015 12.1C17.5015 12.0344 17.4881 11.9695 17.462 11.9093C17.436 11.8491 17.3978 11.7949 17.35 11.75Z"
          :fill="iconColor"
        />
      </g>
    </g>

    <defs>
      <clipPath :id="uid0">
        <rect
          fill="transparent"
          height="12"
          transform="translate(5.5 6.09998)"
          width="12"
        />
      </clipPath>

      <clipPath :id="uid1">
        <rect
          fill="transparent"
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
  const uid0 = 'clip0_2695_15767_' + _uid
  const uid1 = 'clip1_2695_15767_' + _uid
</script>
