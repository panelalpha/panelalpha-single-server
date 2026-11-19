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
        d="M9 4C9.82843 4 10.5 3.32843 10.5 2.5C10.5 1.67157 9.82843 1 9 1C8.17157 1 7.5 1.67157 7.5 2.5C7.5 3.32843 8.17157 4 9 4Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M3 7.5C3.82843 7.5 4.5 6.82843 4.5 6C4.5 5.17157 3.82843 4.5 3 4.5C2.17157 4.5 1.5 5.17157 1.5 6C1.5 6.82843 2.17157 7.5 3 7.5Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M9 11C9.82843 11 10.5 10.3284 10.5 9.5C10.5 8.67157 9.82843 8 9 8C8.17157 8 7.5 8.67157 7.5 9.5C7.5 10.3284 8.17157 11 9 11Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M4.29492 6.755L7.70992 8.745"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M7.70492 3.255L4.29492 5.245"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
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
        d="M12 5.33333C13.1046 5.33333 14 4.4379 14 3.33333C14 2.22876 13.1046 1.33333 12 1.33333C10.8954 1.33333 10 2.22876 10 3.33333C10 4.4379 10.8954 5.33333 12 5.33333Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M4 10C5.10457 10 6 9.10457 6 8C6 6.89543 5.10457 6 4 6C2.89543 6 2 6.89543 2 8C2 9.10457 2.89543 10 4 10Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M12 14.6667C13.1046 14.6667 14 13.7712 14 12.6667C14 11.5621 13.1046 10.6667 12 10.6667C10.8954 10.6667 10 11.5621 10 12.6667C10 13.7712 10.8954 14.6667 12 14.6667Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M5.72665 9.00667L10.28 11.66"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />

      <path
        d="M10.2733 4.34L5.72665 6.99333"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>

    <svg
      v-else-if="iconSize === '20'"
      fill="none"
      height="21"
      viewBox="0 0 20 21"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :clip-path="'url(#' + uid0 + ')'">
        <path
          d="M15 6.68671C16.3807 6.68671 17.5 5.56742 17.5 4.18671C17.5 2.80599 16.3807 1.68671 15 1.68671C13.6193 1.68671 12.5 2.80599 12.5 4.18671C12.5 5.56742 13.6193 6.68671 15 6.68671Z"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />

        <path
          d="M5 12.52C6.38071 12.52 7.5 11.4007 7.5 10.02C7.5 8.63931 6.38071 7.52002 5 7.52002C3.61929 7.52002 2.5 8.63931 2.5 10.02C2.5 11.4007 3.61929 12.52 5 12.52Z"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />

        <path
          d="M15 18.3533C16.3807 18.3533 17.5 17.234 17.5 15.8533C17.5 14.4726 16.3807 13.3533 15 13.3533C13.6193 13.3533 12.5 14.4726 12.5 15.8533C12.5 17.234 13.6193 18.3533 15 18.3533Z"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />

        <path
          d="M7.15833 11.2784L12.85 14.595"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />

        <path
          d="M12.8417 5.44501L7.15833 8.76167"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />
      </g>

      <defs>
        <clipPath :id="uid0">
          <rect
            fill="currentColor"
            height="20"
            transform="translate(0 0.0200195)"
            width="20"
          />
        </clipPath>
      </defs>
    </svg>

    <svg
      v-else-if="iconSize === '24'"
      fill="none"
      height="25"
      viewBox="0 0 24 25"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 8.01001C19.6569 8.01001 21 6.66686 21 5.01001C21 3.35316 19.6569 2.01001 18 2.01001C16.3431 2.01001 15 3.35316 15 5.01001C15 6.66686 16.3431 8.01001 18 8.01001Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M6 15.01C7.65685 15.01 9 13.6669 9 12.01C9 10.3532 7.65685 9.01001 6 9.01001C4.34315 9.01001 3 10.3532 3 12.01C3 13.6669 4.34315 15.01 6 15.01Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M18 22.01C19.6569 22.01 21 20.6669 21 19.01C21 17.3532 19.6569 16.01 18 16.01C16.3431 16.01 15 17.3532 15 19.01C15 20.6669 16.3431 22.01 18 22.01Z"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M8.58984 13.52L15.4198 17.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />

      <path
        d="M15.4098 6.52002L8.58984 10.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>
  </div>
</template>

<script lang="ts" setup>
  import { getCurrentInstance, useId } from 'vue'

  // VIcon → VComponentIcon → this SFC; size lives on VIcon (two levels up).
  const vIconSize = getCurrentInstance()?.parent?.parent?.props?.size
  const iconSize = String(vIconSize ?? '')

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'clip0_6368_33033_' + _uid
</script>

<style lang="scss">
    .share-instance-btn{
      svg{
          path{
            stroke: var(--v-gray-darken1);
            transition: 0.3s;
          }
      }
      &:hover{
          svg{
          path{
              stroke: var(--v-link-hover);
          }
          }
      }
    }
</style>
