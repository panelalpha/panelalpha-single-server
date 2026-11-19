<template>
  <v-row class="row--small top-bar__tabs mt-0 px-0 mx-0">
    <v-col class="py-0 px-0 d-flex" cols="12">
      <v-tabs
        center-active
        :model-value="activeKey"
        next-icon="$chevronright"
        prev-icon="$chevronleft"
        @vue:mounted="centerActiveTabOnMount"
      >
        <v-tab
          v-for="tab in tabs"
          :key="tab.key"
          v-ripple="false"
          class="p-1 font-weight-600 top-bar__item"
          :data-testid="`instance-tab-${tab.key}`"
          :to="tab.to"
          :value="tab.key"
        >{{ t(tab.labelKey) }}<InstanceStatusTabAlert
          v-if="tab.key === 'general'"
          :key="instance.id"
          :instance="instance"
        />

          <template v-if="tab.chip">
            <v-tooltip
              location="bottom"
              :open-delay="150"
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <StatusLabel
                  v-bind="activatorProps"
                  class="top-bar__chip ml-2"
                  :class="{ 'cursor-pointer': tab.chip.action }"
                  :data-testid="`instance-tab-${tab.key}-chip`"
                  :icon="tab.chip.icon"
                  :status="tab.chip.tone"
                  :value="tab.chip.count || undefined"
                  @click="onChipClick(tab.chip)"
                />
              </template>

              <span
                v-for="(line, index) in tab.chip.tooltip"
                :key="index"
                class="d-block"
                :class="{ 'font-weight-bold': 'strong' in line && line.strong }"
              >
                {{ lineText(line) }}
              </span>
            </v-tooltip>
          </template>
        </v-tab>
      </v-tabs>

      <div
        v-if="hostingLinkVisible"
        class="d-flex align-center"
      >
        <router-link
          class="d-flex align-center"
          :to="hostingLink"
        >
          <span class="p-1 link-text d-flex align-center">
            <v-icon
              class="mr-2 link-text"
              color="info"
              icon="$externallink"
              :size="16"
            />
            {{ t('general.hosting') }}
          </span>
        </router-link>
      </div>

      <ReportProviderTrackingCodeModal
        v-model="codeModalOpen"
        :instance="instance"
      />
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
  import type { InstanceTabChip, InstanceTabTooltipLine } from '@/views/projects/project/instance-tabs'
  // The tabs and their chips are `instance-tabs.ts`. Below `md`
  // the Hosting link moves above the buttons (`TopBar`).
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import {
    activeInstanceTab,
    buildInstanceTabs,
    hostingLinkTo,
    showHostingLink,
  } from '@/views/projects/project/instance-tabs'
  import { checkPrivilege, PRIVILEGES } from '@/entities/privileges/privileges'
  import { getAutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import { isBackupStoreMissing } from '@/entities/project/ui/backups/automatic-backup'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { centerActiveTabOnMount } from '@/shared/ui/tabs/center-active-tab'
  import InstanceStatusTabAlert from './InstanceStatusTabAlert.vue'
  import ReportProviderTrackingCodeModal from './ReportProviderTrackingCodeModal.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const route = useRoute()
  const session = useSessionStore()
  const { smAndDown } = useDisplay()

  // No backup store: the Backups chip says so. Asked only when the chip warns anyway (a working schedule with a recent
  // backup needs no warning) and the server does not run its own backups; an older Engine or a failed GET keeps the legacy tooltip.
  const backupStoreMissing = ref(false)
  let storeRequest = 0

  watch(() => props.instance.id, async () => {
    const request = ++storeRequest
    backupStoreMissing.value = false
    const instance = props.instance
    const usesOwnBackupSystem = instance.server_settings?.uses_own_backup_system === true
    if (usesOwnBackupSystem
      || !checkPrivilege(instance.privileges, PRIVILEGES.MANAGE_BACKUPS)
      || (instance.hasAutomaticBackup() && instance.hasRecentBackup())) {
      return
    }
    const settings = await getAutomaticBackupSettings(instance.id)
    if (request === storeRequest) {
      backupStoreMissing.value = isBackupStoreMissing(settings, usesOwnBackupSystem)
    }
  }, { immediate: true })

  const tabs = computed(() => buildInstanceTabs(props.instance, props.instance.privileges, {
    spaBase: preferredSpaBase(session.home),
    reportProviderEnabled: session.home?.app.integrations?.report_provider_enabled === true,
    backupStoreMissing: backupStoreMissing.value,
    freePanel: Boolean(session.home?.app?.community_panel),
  }))

  const activeKey = computed(() => activeInstanceTab(route.path, tabs.value))

  const hostingLinkVisible = computed(() => showHostingLink(
    smAndDown.value,
    props.instance.hasAnyHostingPrivilege(),
    session.home?.app.single_server?.active === true,
  ))
  const hostingLink = computed(() => hostingLinkTo(props.instance.service_id))

  const codeModalOpen = ref(false)

  /** Only the report provider in error opens the tracking code. */
  function onChipClick (chip: InstanceTabChip): void {
    if (chip.action === 'report-provider-code') {
      codeModalOpen.value = true
    }
  }

  function lineText (line: InstanceTabTooltipLine): string {
    if ('text' in line) {
      return line.text
    }
    const translated = Object.fromEntries(
      Object.entries(line.paramKeys ?? {}).map(([name, key]) => [name, t(key)]),
    )
    return t(line.key, { ...line.params, ...translated })
  }
</script>

<style lang="scss" scoped>
// V2 `.row` gives the bottom -12px, which the row keeps. The side margins are zeroed by `mx-0` in the template.
.top-bar__tabs {
  margin-bottom: -12px;
}

// Two classes + the scope attribute outrank the global `_tabs` / V4 `.v-btn` colour rules without `!important`.
.top-bar__item.v-tab {
  &:hover,
  &.v-tab--selected {
    color: var(--v-primary-darken1);
  }
}

// Legacy `v-tabs` takes the row, so the Hosting link sits at the right edge (V4 `v-tabs` only takes its content width).
.top-bar__tabs .v-tabs {
  flex: 1 1 auto;
  min-width: 0;
}

// Legacy chip size: 32 px tall, the 16 px icon in the state colour (the kit chip is 24 px).
.v-chip.status-label.top-bar__chip {
  --v-chip-height: 32px;

  height: 32px;
  padding: 0 8px;

  // Icon-only chip: centre the icon (V4 adds an end margin to the chip icon).
  :deep(.v-chip__content) {
    justify-content: center;
  }

  :deep(.v-icon) {
    margin-inline: 0;
  }
}

.cursor-pointer {
  cursor: pointer;
}

.v-tab {
  min-width: unset;
}

// Legacy `p-1` (V2 `!important`) gives 4px per side; the global `_tabs` rule zeroes V4 tab padding with `!important`.
.top-bar__item.v-tab {
  padding-left: 4px !important;
  padding-right: 4px !important;
}
</style>
