<template>
  <svg
    fill="none"
    :height="height"
    viewBox="0 0 20 20"
    :width="width"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M10 16C13.3137 16 16 13.3137 16 10C16 6.68629 13.3137 4 10 4C6.68629 4 4 6.68629 4 10C4 13.3137 6.68629 16 10 16Z" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M10 7V13" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M7.00003 10H13" :stroke="iconColor" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<script lang="ts" setup>
  withDefaults(defineProps<{
    width?: number | string
    height?: number | string
    iconColor?: string
  }>(), {
    width: 24,
    height: 24,
    iconColor: 'currentColor',
  })
</script>

<style lang="scss" scoped>
    .label-list__items-remaining{
        &.label-list__items-remaining--add{
            svg{
                path{
                stroke: var(--v-link-base);
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
    }
</style>
