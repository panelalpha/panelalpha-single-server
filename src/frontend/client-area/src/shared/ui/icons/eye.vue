<template>
  <div>
    <svg
      v-if="iconSize === '32'"
      fill="none"
      height="32"
      viewBox="0 0 32 32"
      width="32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.33331 16C1.33331 16 6.66665 5.33331 16 5.33331C25.3333 5.33331 30.6666 16 30.6666 16C30.6666 16 25.3333 26.6666 16 26.6666C6.66665 26.6666 1.33331 16 1.33331 16Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M16 20C18.2091 20 20 18.2091 20 16C20 13.7909 18.2091 12 16 12C13.7909 12 12 13.7909 12 16C12 18.2091 13.7909 20 16 20Z"
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
      <g :clip-path="'url(#' + uid0 + ')'">
        <path
          d="M0.833252 9.99998C0.833252 9.99998 4.16658 3.33331 9.99992 3.33331C15.8333 3.33331 19.1666 9.99998 19.1666 9.99998C19.1666 9.99998 15.8333 16.6666 9.99992 16.6666C4.16658 16.6666 0.833252 9.99998 0.833252 9.99998Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </g>

      <defs>
        <clipPath :id="uid0">
          <rect fill="white" height="20" width="20" />
        </clipPath>
      </defs>
    </svg>

    <svg
      v-else-if="iconSize === '18'"
      fill="none"
      height="19"
      viewBox="0 0 19 19"
      width="19"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid2 + ')'">
        <path
          d="M1.4165 9.02002C1.4165 9.02002 4.4165 3.02002 9.6665 3.02002C14.9165 3.02002 17.9165 9.02002 17.9165 9.02002C17.9165 9.02002 14.9165 15.02 9.6665 15.02C4.4165 15.02 1.4165 9.02002 1.4165 9.02002Z"
          stroke="#49495F"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M9.6665 11.27C10.9091 11.27 11.9165 10.2627 11.9165 9.02002C11.9165 7.77738 10.9091 6.77002 9.6665 6.77002C8.42386 6.77002 7.4165 7.77738 7.4165 9.02002C7.4165 10.2627 8.42386 11.27 9.6665 11.27Z"
          stroke="#49495F"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </g>

      <defs>
        <clipPath :id="uid2">
          <rect
            fill="white"
            height="18"
            transform="translate(0.666504 0.0200195)"
            width="18"
          />
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
      <g :clip-path="'url(#' + uid1 + ')'">
        <path
          d="M0.666748 8.00002C0.666748 8.00002 3.33341 2.66669 8.00008 2.66669C12.6667 2.66669 15.3334 8.00002 15.3334 8.00002C15.3334 8.00002 12.6667 13.3334 8.00008 13.3334C3.33341 13.3334 0.666748 8.00002 0.666748 8.00002Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />
      </g>

      <defs>
        <clipPath :id="uid1">
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
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
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

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_1010_4608_' + _uid
  const uid1 = 'clip0_1011_5176_' + _uid
  const uid2 = 'clip0_7446_20749_' + _uid
</script>
