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
      <g :clip-path="'url(#' + uid0 + ')'">
        <path
          d="M15 8L1 8"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M3.54545 13H2.4C2.0287 13 1.6726 12.8726 1.41005 12.6459C1.1475 12.4192 1 12.1117 1 11.7911V7.16454L2.83702 3.9967C3.19478 3.37976 3.85399 3 4.56716 3H11.4328C12.146 3 12.8052 3.37976 13.163 3.9967L15 7.16454V11.7911C15 12.1117 14.8525 12.4192 14.5899 12.6459C14.3274 12.8726 13.9713 13 13.6 13H12.4545"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M8 16L8 12"
          :stroke="iconColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1"
        />

        <path
          d="M6 13L8 11L10 13"
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
      v-else-if="iconSize === '20'"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19 11L1 11"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M4.27273 17H2.8C2.32261 17 1.86477 16.8302 1.52721 16.5279C1.18964 16.2256 1 15.8157 1 15.3882V10.5527L3.53246 6.02388C3.88599 5.39166 4.55373 5 5.27808 5H14.7219C15.4463 5 16.114 5.39166 16.4675 6.02388L19 10.5527V15.3882C19 15.8157 18.8104 16.2256 18.4728 16.5279C18.1352 16.8302 17.6774 17 17.2 17H15.7273"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M10 19L10 15"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M7.5 15.8333L10 13.3333L12.5 15.8333"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
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
        d="M23 13H1"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M5 21H3.2C2.61652 21 2.05695 20.7761 1.64437 20.3776C1.23178 19.9791 1 19.4386 1 18.875V12.5L4.23537 6.25892C4.57918 5.59571 5.26394 5.17938 6.01097 5.17938H17.989C18.7361 5.17938 19.4208 5.59571 19.7646 6.25892L23 12.5V18.875C23 19.4386 22.7682 19.9791 22.3556 20.3776C21.9431 20.7761 21.3835 21 20.8 21H19"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M12 21L12 17"
        :stroke="iconColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M9 19L12 16L15 19"
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
  const uid0 = 'clip0_2579_55275_' + _uid
</script>
