<template>
  <img
    alt=""
    class="brand-logo"
    :class="{ 'brand-logo--compact': compact }"
    :height="compact ? 44 : 60"
    :src="src"
    width="200"
  >
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useTheme } from 'vuetify'
  import { type BrandLogoValues, resolveBrandLogoSrc } from './brand-logo'

  // `compact`: the 44px (mobile 36px) logo of the onboarding progress modals; the default stays the 60px auth / onboarding-process logo.
  const props = defineProps<BrandLogoValues & { compact?: boolean }>()

  const theme = useTheme()

  const src = computed(() => resolveBrandLogoSrc(
    { logo: props.logo, darkLogo: props.darkLogo },
    theme.global.current.value.dark,
  ))
</script>

<style lang="scss">
  // Legacy (v-img 171 / 200 wide) switches below the JS `md` threshold (992px).
  .brand-logo {
    width: 200px;
    height: 60px;
    object-fit: contain;

    @media (max-width: 991.98px) {
      width: 171px;
    }

    &--compact {
      height: 44px;

      @media (max-width: 991.98px) {
        height: 36px;
      }
    }
  }
</style>
