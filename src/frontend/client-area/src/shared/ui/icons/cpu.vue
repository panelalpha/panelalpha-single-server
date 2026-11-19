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
        d="M24 5.33337H7.99998C6.52722 5.33337 5.33331 6.52728 5.33331 8.00004V24C5.33331 25.4728 6.52722 26.6667 7.99998 26.6667H24C25.4727 26.6667 26.6666 25.4728 26.6666 24V8.00004C26.6666 6.52728 25.4727 5.33337 24 5.33337Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M20 12H12V20H20V12Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 1.33337V5.33337"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M20 1.33337V5.33337"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 26.6666V30.6666"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M20 26.6666V30.6666"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M26.6667 12H30.6667"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M26.6667 18.6666H30.6667"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M1.33331 12H5.33331"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M1.33331 18.6666H5.33331"
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
          d="M15 3.33331H5.00004C4.07957 3.33331 3.33337 4.0795 3.33337 4.99998V15C3.33337 15.9205 4.07957 16.6666 5.00004 16.6666H15C15.9205 16.6666 16.6667 15.9205 16.6667 15V4.99998C16.6667 4.0795 15.9205 3.33331 15 3.33331Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M12.5 7.5H7.5V12.5H12.5V7.5Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M7.5 0.833313V3.33331"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M12.5 0.833313V3.33331"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M7.5 16.6666V19.1666"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M12.5 16.6666V19.1666"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M16.6666 7.5H19.1666"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M16.6666 11.6666H19.1666"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M0.833374 7.5H3.33337"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M0.833374 11.6666H3.33337"
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
      v-else-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid1 + ')'">
        <path
          d="M12.0001 2.66669H4.00008C3.2637 2.66669 2.66675 3.26364 2.66675 4.00002V12C2.66675 12.7364 3.2637 13.3334 4.00008 13.3334H12.0001C12.7365 13.3334 13.3334 12.7364 13.3334 12V4.00002C13.3334 3.26364 12.7365 2.66669 12.0001 2.66669Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M10 6H6V10H10V6Z"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M6 0.666687V2.66669"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M10 0.666687V2.66669"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M6 13.3333V15.3333"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M10 13.3333V15.3333"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M13.3333 6H15.3333"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M13.3333 9.33331H15.3333"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M0.666748 6H2.66675"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M0.666748 9.33331H2.66675"
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
        d="M18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M15 9H9V15H15V9Z"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M9 1V4"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M15 1V4"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M9 20V23"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M15 20V23"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M20 9H23"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M20 14H23"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M1 9H4"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M1 14H4"
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
  const uid0 = 'clip0_1010_4591_' + _uid
  const uid1 = 'clip0_1011_5172_' + _uid
</script>
