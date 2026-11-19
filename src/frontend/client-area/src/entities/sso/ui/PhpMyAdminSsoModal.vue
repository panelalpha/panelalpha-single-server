<template>
  <v-dialog
    v-model="opened"
    :persistent="persistent"
  >
    <v-card
      class="basic-modal"
      data-testid="phpmyadmin-sso-modal"
      elevation="4"
    >
      <v-card-title class="d-flex justify-space-between">
        <h6 class="heading--text d-flex align-center">
          <v-icon
            class="mr-4"
            color="info"
            icon="$database"
            size="24"
          />

          <span>{{ t('heading.instance.phpmyadminSsoChoice.title') }}</span>
        </h6>

        <ModalCloseButton
          v-if="!submitting"
          @click="close()"
        />
      </v-card-title>

      <v-card-text>
        <p
          v-if="submitting"
          class="mb-4 p-2"
          data-testid="phpmyadmin-sso-message"
        >
          {{ t('heading.instance.phpmyadminSsoChoice.message') }}
        </p>

        <AppMessage
          v-if="dnsMismatchDetected"
          class="my-5"
          data-testid="phpmyadmin-sso-alert"
          icon="$alertcircle"
          variant="warning"
        >
          <span>{{ t('notification.instance.modal.phpmyadminSsoChoice.dnsMismatch') }}</span>
        </AppMessage>

        <v-form
          v-if="showDatabaseSelect"
          class="d-flex flex-column"
        >
          <div class="d-flex flex-column">
            <label class="base--text mb-2">
              {{ t('form.label.database') }}
            </label>

            <div class="last-child">
              <v-select
                v-model="databaseId"
                data-testid="phpmyadmin-sso-database"
                density="compact"
                hide-details="auto"
                item-title="label"
                item-value="value"
                :items="databases"
                menu-icon="$dropdown"
                :menu-props="{ offset: 8 }"
                variant="outlined"
              />
            </div>
          </div>
        </v-form>
      </v-card-text>

      <v-card-actions class="d-flex flex-wrap pb-4">
        <div class="w-100 pb-2">
          <v-row>
            <v-col>
              <AppButton
                block
                data-testid="phpmyadmin-sso-preview"
                :disabled="submitting"
                kind="primary"
                :loading="submitting && submittingAction === 'preview'"
                size="large"
                @click="login('preview')"
              >
                <span class="p-2 font-weight-600">
                  {{ t('button.loginWithTempUrl') }}
                </span>
              </AppButton>
            </v-col>

            <v-col>
              <AppButton
                block
                color="gray"
                data-testid="phpmyadmin-sso-direct"
                :disabled="submitting"
                kind="primary"
                :loading="submitting && submittingAction === 'default'"
                size="large"
                @click="login('default')"
              >
                <span class="p-2 font-weight-600">
                  {{ t('button.loginDirectly') }}
                </span>
              </AppButton>
            </v-col>
          </v-row>
        </div>

        <!-- The browser blocked the window opened after the request: the url is opened by this click. -->
        <div
          v-if="loginUrl"
          class="w-100 pb-2"
        >
          <AppButton
            block
            data-testid="phpmyadmin-sso-login"
            kind="primary"
            size="large"
            @click="loginFromFallback"
          >
            <span class="p-2 font-weight-600">
              {{ t('button.ssoLogin') }}
            </span>
          </AppButton>
        </div>

        <div class="w-100 pb-2 cancel-btn">
          <AppButton
            block
            class="normal"
            data-testid="phpmyadmin-sso-cancel"
            :disabled="submitting"
            kind="text"
            size="large"
            @click="close()"
          >
            <span class="p-2 font-weight-bold text--gray-darken1">
              {{ t('button.cancel') }}
            </span>
          </AppButton>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  // The modal runs its own requests: the host sets the
  // props through `usePhpMyAdminSso`, and the login buttons call the API. Plesk with more than one database gets a select, Plesk with one
  // sends its id without a select, and the temporary URL is only requested by its own button.
  import type { PhpMyAdminDatabase } from '@/entities/sso/phpmyadmin-sso.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { getPhpMyAdminPreviewSsoUrl, getPhpMyAdminSsoUrl } from '@/entities/sso/phpmyadmin-sso.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { popupBlocked } from '@/shared/browser/popup'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  const props = withDefaults(defineProps<{
    hostingAccountId?: number | null
    serverType?: string | null
    databases?: PhpMyAdminDatabase[]
    dnsMismatchDetected?: boolean
  }>(), {
    hostingAccountId: null,
    serverType: null,
    databases: () => [],
    dnsMismatchDetected: false,
  })

  const opened = defineModel<boolean>({ default: false })

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const persistent = ref(false)
  const submitting = ref(false)
  const submittingAction = ref<'default' | 'preview' | null>(null)
  const databaseId = ref<number | undefined>(undefined)
  // Set when the browser blocked the window: the one-time url waits for the fallback button.
  const loginUrl = ref('')

  const showDatabaseSelect = computed(() => props.serverType === 'plesk' && props.databases.length > 1)

  // The first database is selected, and a fresh dialog has no submit in progress.
  function resetForOpen (): void {
    loginUrl.value = ''
    submitting.value = false
    submittingAction.value = null
    databaseId.value = props.databases[0]?.value
  }

  // `immediate`: a dialog mounted already open still selects the first database.
  watch(opened, value => {
    if (value) {
      resetForOpen()
    }
  }, { immediate: true })

  watch(() => props.databases, () => {
    databaseId.value = props.databases[0]?.value
  })

  function close (): void {
    opened.value = false
  }

  function loginFromFallback (): void {
    window.open(loginUrl.value)
    close()
  }

  async function login (action: 'default' | 'preview'): Promise<void> {
    const accountId = props.hostingAccountId
    if (submitting.value || accountId === null) {
      return
    }
    persistent.value = true
    submitting.value = true
    submittingAction.value = action
    try {
      // Legacy sends `database_id` for Plesk only, and only when one is selected.
      const selected = props.serverType === 'plesk' && databaseId.value ? databaseId.value : undefined
      const url = action === 'preview'
        ? await getPhpMyAdminPreviewSsoUrl(accountId, selected)
        : await getPhpMyAdminSsoUrl(accountId, selected)
      if (!url) {
        alerts.addAlert({ success: false, errorMessage: t('message.status.action.error') })
      } else if (popupBlocked(window.open(url))) {
        loginUrl.value = url
      } else {
        close()
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      persistent.value = false
      submitting.value = false
      submittingAction.value = null
    }
  }
</script>

<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />

<style lang="scss" scoped>
// Deliberate departure from legacy (`_general.scss` `.row`: margin -16px + 12px column padding): that put the
// two login buttons 4px outside the warning box and 24px apart, so they did not line up with the box or the Cancel button. The row is
// flush with the 32px content column of the card (same edges as the warning box) and the buttons are 16px apart.
.v-card-actions .v-row {
  --v-col-gap-x: 16px;
  --v-col-gap-y: 16px;
  margin: 0;
}

.v-card-actions .v-col {
  padding: 0;
}
</style>
