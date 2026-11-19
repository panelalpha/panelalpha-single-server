<template>
  <AppButton
    :aria-label="ariaLabel"
    :disabled="disabled"
    kind="page-add"
    :loading="loading"
    :size="smAndDown ? 'small' : 'large'"
  >
    <v-icon
      :icon="icon"
      size="24"
    />
    {{ ` ${label}` }}
  </AppButton>
</template>

<script lang="ts" setup>
  // Add button of a page title: one look for every screen. `large` from `md`, `small` below
  // (legacy `:large="!smAndDown" :small="smAndDown"`); the icon and the label on every width (back to the
  // text on phone and tablet, as legacy). `ariaLabel` sets a name that differs from the label (Reseller API). `data-testid`, `class` and
  // `@click` fall through to the button.
  // `icon`: `$plus` for Add; another header action of the same look (Logs Download) passes its own icon. No i18n here: the label comes in as a prop.
  import { useDisplay } from 'vuetify'
  import AppButton from './AppButton.vue'

  withDefaults(defineProps<{
    label: string
    icon?: string
    ariaLabel?: string
    loading?: boolean
    disabled?: boolean
  }>(), {
    icon: '$plus',
    ariaLabel: undefined,
    loading: undefined,
    disabled: undefined,
  })

  const { smAndDown } = useDisplay()
</script>
