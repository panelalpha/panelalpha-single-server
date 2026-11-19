<template>
  <AppButton
    :aria-label="t('button.close')"
    :class="{ 'ml-auto': pushRight }"
    kind="close"
  >
    <v-icon
      :color="iconColor"
      icon="$close"
      size="24"
    />
  </AppButton>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  // Close icon button of a V2 `v-card-title` (shared chrome of the project modals). `data-testid`, `disabled` and `@click` fall through to the button.
  // `iconColor`: a legacy `<v-icon color="…">` on the close icon (e.g. `gray` in Cancel installation);
  // the colour utility (`text-<color>`, `!important`) wins over the default icon-button colour below.
  // `aria-label` (`button.close`) is not in legacy (no label on the V2 close icon): added by user decision on 2026-10-26.
  // `pushRight` (default): the button pushes itself to the end of the title row (`ml-auto`, the V2 `v-spacer`). A title that spaces its children with
  // `justify-space-between` (the DNS dialog of a domain) sets it to `false`, so a wrapped button stays at the start of its line as in legacy.
  withDefaults(defineProps<{ iconColor?: string, pushRight?: boolean }>(), { iconColor: undefined, pushRight: true })

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// V2 `<v-btn x-small icon>` / `.theme--light.v-icon` are `rgba(0, 0, 0, 0.54)` (white in dark); V4's icon button is the 0.87 text colour
// and the global `.v-icon` colour beats the button colour (`--v-icon-btn-color`).
.modal-close-button,
.modal-close-button .v-icon {
  color: var(--v-icon-btn-color);
}
</style>
