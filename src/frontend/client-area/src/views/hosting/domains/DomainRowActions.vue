<template>
  <AppButton
    v-if="view.star.visible"
    :aria-label="t('button.setAsPrimaryDomain')"
    :class="{ 'bgcolor-transparent': item.type === 'main' }"
    data-testid="domains-row-action-set-primary"
    :disabled="view.star.disabled"
    kind="row-action"
    :loading="item.editSslButtonLoading"
    :tooltip="t('button.setAsPrimaryDomain')"
    @click="emit('set-primary', item)"
  >
    <v-icon :icon="view.star.icon" />
  </AppButton>

  <v-tooltip
    v-if="view.ssl.visible"
    content-class="domain-ssl-tooltip"
    location="bottom"
    :max-width="370"
    :offset="14"
    open-delay="150"
    transition="custom-tooltip"
    :z-index="99"
  >
    <template #activator="{ props: activatorProps }">
      <!-- The wrapper catches the hover: V4 puts no pointer events on a disabled button, so its own tooltip would never open. -->
      <span
        v-bind="activatorProps"
        class="d-inline-block"
      >
        <AppButton
          :aria-label="sslEditTooltip(item, t)"
          data-testid="domains-row-action-ssl-edit"
          :disabled="view.ssl.disabled"
          kind="row-action"
          :loading="item.editSslButtonLoading"
          @click="onSslEdit"
        >
          <v-icon icon="$lockoutline" />
        </AppButton>
      </span>
    </template>

    <span>{{ sslEditTooltip(item, t) }}</span>
  </v-tooltip>

  <AppButton
    v-if="view.edit.visible"
    :aria-label="t('button.domain.edit')"
    data-testid="domains-row-action-edit"
    kind="row-action"
    :tooltip="t('button.domain.edit')"
    @click="emit('edit', item)"
  >
    <v-icon icon="$edit2" />
  </AppButton>

  <AppButton
    v-if="view.delete.visible"
    :aria-label="t('button.domain.delete')"
    data-testid="domains-row-action-delete"
    kind="row-action"
    :tooltip="t('button.domain.delete')"
    @click="emit('delete', item)"
  >
    <v-icon icon="$thrash" />
  </AppButton>
</template>

<script lang="ts" setup>
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { HostingDomain } from './domains.types'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { canOpenSslFromCell, sslEditTooltip, visibleActions } from './domains-actions'

  const props = defineProps<{
    item: HostingDomain
    service: HostingService
    mobile: boolean
  }>()

  const emit = defineEmits<{
    'set-primary': [item: HostingDomain]
    'ssl-edit': [item: HostingDomain]
    'edit': [item: HostingDomain]
    'delete': [item: HostingDomain]
  }>()

  const { t } = useTranslation()

  const view = computed(() => visibleActions(props.item, props.service, { mobile: props.mobile }))

  /** A blocked order or a row without `can_manage_ssl` (the mobile list shows the button anyway) opens nothing. */
  function onSslEdit (): void {
    if (canOpenSslFromCell(props.item)) {
      emit('ssl-edit', props.item)
    }
  }
</script>

<style lang="scss">
// The V2 tooltip text had a 22px line (V4 inherits the 1.6 of the page, 22.4px).
.domain-ssl-tooltip {
  line-height: 22px;
}
</style>

<style lang="scss" scoped>
// The disabled star of a main domain: V2 left the golden icon as it was; V4 fades a disabled button and draws its state layer.
// `!important` on the fill: the global disabled-button rule (`_buttons.scss` "Disabled elevated/flat button") is `!important` and (0,4,0), so a plain
// declaration here paints the disabled fill (`--v-btn-disabled-bg`) behind the icon (measured: `domains-main-star` background 242,242,247).
.v-btn.bgcolor-transparent {
  background-color: transparent !important;

  &.v-btn--disabled {
    opacity: 1;
    background-color: transparent !important;

    .v-btn__overlay,
    .v-btn__underlay {
      display: none;
    }
  }
}

// V2 icon buttons are 14px; V4 `size="small"` sets 12px. The icon inherits the button colour (`_tables.scss`). Without `!important` on the colour: the
// global disabled icon-button rule (`_buttons.scss`, disabled follows the app) beat it already, and an enabled button measures the same.
.v-btn {
  font-size: 14px;
  color: var(--v-text-darken1);

  .v-icon {
    color: inherit;
  }
}
</style>
