<template>
  <svg
    fill="none"
    height="24"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
  >
    <rect
      :fill="'url(#' + uid0 + ')'"
      height="21.9999"
      width="21.9999"
      x="1.00006"
      y="1"
    />

    <defs>
      <pattern :id="uid0" height="1" patternContentUnits="objectBoundingBox" width="1">
        <use transform="scale(0.0104167)" xlink:href="#image0_6514_4603" />
      </pattern>

      <image
        id="image0_6514_4603"
        height="96"
        preserveAspectRatio="none"
        width="96"
        xlink:href="data:image/png;base64,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"
      />
    </defs>
  </svg>
</template>

<script lang="ts" setup>
  import { useId } from 'vue'

  const _uid = useId().replace(/:/g, '')
  const uid0 = 'pattern0_6514_4603_' + _uid
</script>

<style scoped lang="scss">
    body.is-dark{
        .social-login-btns{
            .social-login-btn{
            .social-icon-github{
                svg{
                filter: brightness(10);
                rect{
                }
                }
            }
            }
        }
    }
</style>
