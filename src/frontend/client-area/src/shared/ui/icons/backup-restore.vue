<template>
  <div>
    <svg
      v-if="iconSize === '16'"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid1 + ')'">
        <path
          d="M15.3334 8.66666H0.666748"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M3.19675 3.45291L0.666748 8.33333V12.5833C0.666748 12.9591 0.821271 13.3194 1.09632 13.5851C1.37138 13.8507 1.74443 14 2.13341 14H13.8667C14.2557 14 14.6288 13.8507 14.9038 13.5851C15.1789 13.3194 15.3334 12.9591 15.3334 12.5833V8.33333L12.8034 3.45291"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M8 6.00001L8 1.33334"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M6 2.66666L8 0.666656L10 2.66666"
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
      v-else-if="iconSize === '20'"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid0 + ')'">
        <path
          d="M0.833252 3.33331V8.33331H5.83325"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M19.1667 16.6667V11.6667H14.1667"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />

        <path
          d="M17.0749 7.49998C16.6523 6.30564 15.934 5.23782 14.987 4.39616C14.0401 3.55451 12.8954 2.96645 11.6597 2.68686C10.424 2.40727 9.13762 2.44527 7.92059 2.79729C6.70356 3.14932 5.59554 3.80391 4.69992 4.69998L0.833252 8.33331M19.1666 11.6666L15.2999 15.3C14.4043 16.1961 13.2963 16.8506 12.0792 17.2027C10.8622 17.5547 9.57584 17.5927 8.34016 17.3131C7.10447 17.0335 5.95975 16.4455 5.01281 15.6038C4.06586 14.7621 3.34756 13.6943 2.92492 12.5"
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
      v-else
      fill="none"
      :height="height"
      viewBox="0 0 24 24"
      :width="width"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M23 13H1"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M4.795 5.17938L1 12.5V18.875C1 19.4386 1.23178 19.9791 1.64437 20.3776C2.05695 20.7761 2.61652 21 3.2 21H20.8C21.3835 21 21.9431 20.7761 22.3556 20.3776C22.7682 19.9791 23 19.4386 23 18.875V12.5L19.205 5.17938"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 9L12 2"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M9 4L12 0.999999L15 4"
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
  const uid0 = 'clip0_1010_4594_' + _uid
  const uid1 = 'clip0_1011_5133_' + _uid
</script>
