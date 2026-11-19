<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project` uses the frame with the global `.page-title--advanced`; `hosting` uses its own frame. -->
    <PageTitle
      :title="t('heading.hosting.fileManager.title')"
      title-testid="file-manager-title"
      :variant="isProject ? 'advanced' : 'section'"
    >
      <template
        v-if="!isProject"
        #filters
      >
        <ActiveServerAccountSelector
          v-if="service.server_accounts.length > 1"
          v-model="selectedAccount"
          class="ml-4 file-manager-account-selector"
          data-testid="file-manager-account-selector"
          :items="service.server_accounts"
        />
      </template>

      <template
        v-if="isWpCloud(service)"
        #bottom
      >
        <v-row class="wp-cloud-row">
          <v-col class="wp-cloud-col">
            <AppMessage
              class="file-manager-wp-cloud-alert"
              data-testid="file-manager-wp-cloud-alert"
              variant="warning"
            >
              <p>{{ t('heading.hosting.fileManager.alert.wpCloud') }}</p>
            </AppMessage>
          </v-col>
        </v-row>
      </template>
    </PageTitle>

    <v-container :class="isProject ? 'mt-3 px-0 pt-0' : 'mt-3 px-0'">
      <v-row>
        <v-col cols="12">
          <!-- Legacy embedded the `/fm/` app in an iframe; the native file manager is mounted here instead. -->
          <div
            v-if="cardAccount"
            class="file-manager file-manager-frame"
            data-testid="file-manager"
          >
            <!-- The key mounts the manager anew for another account, so its local state (preview, properties, menu, tree) starts empty. -->
            <FileManager
              :key="cardAccount.id"
              :account-id="cardAccount.id"
            />
          </div>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // Like legacy, but without its dead data fields and the unused
  // `modalOptions.open` watcher.
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { isWpCloud } from '@/views/hosting/domains/domains-list'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import FileManager from './components/FileManager.vue'

  // `project` is the frame of the project Advanced tab: a different header and no
  // account selector.
  const props = withDefaults(defineProps<{
    service: HostingService
    variant?: 'hosting' | 'project'
  }>(), {
    variant: 'hosting',
  })

  const isProject = computed(() => props.variant === 'project')

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const selectedAccount = ref<HostingServerAccount | null>(null)

  // The card needs an account with a numeric id and no diagnostic mode. A project without `hostingId` has no numeric id (legacy renders
  // the iframe with `?id=undefined`), so no card mounts and no request goes out.
  const cardAccount = computed(() => {
    const account = selectedAccount.value
    return account && typeof account.id === 'number' && !account.diagnostic_mode ? account : null
  })

  watch(() => props.service, service => {
    selectedAccount.value = service.server_accounts[0] ?? null
  })
  // The watcher exists before the first account is set (legacy sets it in `mounted` from `null`), so a diagnostic account alerts on
  // the first visit too, not only after a switch.
  watch(selectedAccount, (value, oldValue) => {
    // The project variant has no alert (legacy only hides the iframe).
    if (!isProject.value && value !== oldValue && value?.diagnostic_mode) {
      alerts.addAlert({ success: false, errorMessage: t('message.hostingAccountInDiagnosticMode') })
    }
  })

  selectedAccount.value = props.service.server_accounts[0] ?? null
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>

<style lang="scss" scoped>
// Legacy `mt-8` / `pb-0` on the wp-cloud row and column. V4's `.v-row` margin and `.v-col` padding (layered) beat the spacing utilities,
// so the row lost its 32px top margin and the column its 12px gutter.
.wp-cloud-row {
  margin-top: 32px;
}

// Project variant: legacy `.page-title > .row { margin-bottom: 0 }` reaches the alert row too; V4's `.v-row` margin
// (-16px below) otherwise pulls the fm box 16px up.
.page-title--advanced .wp-cloud-row {
  margin-bottom: 0;
}

.wp-cloud-col {
  padding: 12px 12px 0;
}

// Legacy iframe geometry (`style="width: 100%; height: 700px;"`). From `md` (768px,
// the breakpoint of the tree column) the card keeps 700px; below it the card grows with its content. No global rule
// sets `width` or `height` on `div.file-manager`. In browser fullscreen the card is forced to 100% height (see FileManager.vue).
.file-manager-frame {
  width: 100%;
}

@media (min-width: 768px) {
  .file-manager-frame {
    height: 700px;
  }
}

// The shared selector adds the 3px below the field that summary and domains measure in legacy (76px). On this page legacy measures
// the field at 48px with nothing below (73px selector), so the 3px is dropped here only.
.file-manager-account-selector :deep(.dns-zone) {
  padding-bottom: 0;
}
</style>
