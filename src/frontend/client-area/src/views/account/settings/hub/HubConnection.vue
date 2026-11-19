<template>
  <div class="hub-connection">
    <!-- ui-fix-v2: until GET /community/hub answers, the skeleton of the same frame (bones in the grid of the card). -->
    <FeatureCard
      v-if="loading"
      data-testid="hub-card-loading"
      layout="wide"
      loading
    />

    <!-- ui-fix-v2: connected is the same frame in green: the flag "Connected", the account of the Hub, the points and Disconnect. -->
    <FeatureCard
      v-else-if="connected"
      :checks="checks"
      class="hub-connected"
      data-testid="hub-connected"
      :flag="t('settings.hub.connected')"
      layout="wide"
      ok
      :title="t('settings.panelalphaHub.connectedTitle', { defaultValue: 'This server is connected to PanelAlpha Hub' })"
      title-tag="h2"
    >
      <template #flag-icon>
        <FeatureCheckIcon />
      </template>

      <template
        v-if="accountName"
        #lead
      >
        {{ t('settings.panelalphaHub.connectedAccount', { account: accountName, defaultValue: CONNECTED_ACCOUNT_DEFAULT }) }}
      </template>

      <template #action>
        <AppButton
          :block="!lgAndUp"
          class="hub-disconnect"
          color="error"
          data-testid="hub-disconnect"
          kind="secondary"
          size="large"
          @click="disconnectModalOpen = true"
        >
          {{ ` ${t('settings.hub.disconnect')} ` }}
        </AppButton>
      </template>

      <template #aside>
        <HubDiagram
          :alt="t('settings.panelalphaHub.diagramAlt', { defaultValue: 'This server joins your PanelAlpha Hub account' })"
          ok
        />
      </template>
    </FeatureCard>

    <!-- ui-fix-v2: the offer is the frame of the wizard card (flag, title, lead, checks, button, note, diagram) in the `wide` layout. -->
    <FeatureCard
      v-else
      :busy="connecting || completing || checking"
      :checks="checks"
      class="hub-not-connected"
      data-testid="hub-offer"
      :flag="t('settings.panelalphaHub.offerFlag', { defaultValue: 'Free' })"
      layout="wide"
      :title="t('settings.panelalphaHub.title', { defaultValue: 'Connect this server to PanelAlpha Hub' })"
      title-tag="h2"
    >
      <template #flag-icon>
        <FeatureStarIcon />
      </template>

      <template #lead>
        {{ t('settings.panelalphaHub.lead', { defaultValue: 'Free and optional. This server keeps working on its own either way.' }) }}
      </template>

      <template #action>
        <AppButton
          v-if="retry"
          :block="!lgAndUp"
          class="hub-retry"
          data-testid="hub-check-again"
          kind="field"
          :loading="checking"
          size="large"
          type="button"
          @click="checkAgain"
        >
          {{ t('settings.hub.checkAgain') + ' ' }}

          <template #loader>
            <loader
              color="primary"
              no-margins
              :size="20"
            />

            <span class="ml-3 font-weight-600">{{ t('settings.hub.checking') }}</span>
          </template>
        </AppButton>

        <AppButton
          v-else
          :block="!lgAndUp"
          class="hub-connect"
          data-testid="hub-connect"
          kind="primary"
          :loading="connecting || completing"
          size="large"
          type="button"
          @click="connect"
        >
          {{ t('settings.panelalphaHub.connect', { defaultValue: 'Connect to PanelAlpha Hub' }) + ' ' }}

          <v-icon
            class="ml-2"
            icon="$externallink"
            :size="18"
          />

          <template #loader>
            <loader
              color="white"
              no-margins
              :size="20"
            />

            <span class="ml-3 font-weight-600">{{ connectingLabel }}</span>
          </template>
        </AppButton>
      </template>

      <template #note>
        <span
          class="hub-note"
          :class="{ 'hub-note--warning': retry }"
          data-testid="hub-note"
        >
          <v-icon
            v-if="retry"
            color="warning"
            icon="$hourglassIcon"
            :size="16"
          />
          {{ retry
            ? t('settings.panelalphaHub.pendingNote', { defaultValue: HUB_TOAST_DEFAULTS['settings.panelalphaHub.toast.pending'] })
            : t('settings.panelalphaHub.redirectNote', { defaultValue: 'You sign in on PanelAlpha Hub and come straight back here.' }) }}
        </span>
      </template>

      <template #aside>
        <HubDiagram
          :alt="t('settings.panelalphaHub.diagramAlt', { defaultValue: 'This server joins your PanelAlpha Hub account' })"
        />
      </template>
    </FeatureCard>

    <hub-disconnect-modal
      v-model="disconnectModalOpen"
      :loading="disconnecting"
      :password-generated="passwordGenerated"
      @confirm="disconnect"
      @set-password="setPassword"
    />
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import {
    type HubPairing,
    type HubRetry,
    hubReturnOf,
    isHttpUrl,
    outcomeOf,
    pairingOf,
    queryWithoutHubReturn,
    retryAfterError,
  } from '@/entities/hub/hub-connection'
  import { FREE_HUB_RETURN_KEY } from '@/entities/hub/hub-return'
  import { completeHub, disconnectHub, getHubStatus, startHub } from '@/entities/hub/hub.api'
  import HubDiagram from '@/entities/hub/ui/HubDiagram.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { clearAllCachedGet } from '@/shared/api/cached-get'
  import { getErrorMessages } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import FeatureCard from '@/shared/ui/feature-card/FeatureCard.vue'
  import FeatureCheckIcon from '@/shared/ui/feature-card/FeatureCheckIcon.vue'
  import FeatureStarIcon from '@/shared/ui/feature-card/FeatureStarIcon.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import { CONNECTED_ACCOUNT_DEFAULT, DISCONNECT_SET_PASSWORD_DEFAULT, HUB_TOAST_DEFAULTS, UNREACHABLE_DEFAULT } from './hub-copy'
  import HubDisconnectModal from './HubDisconnectModal.vue'

  const { t: translate } = useTranslation()
  const t = translate as (key: string, options?: Record<string, unknown>) => string
  const route = useRoute()
  const router = useRouter()
  const { lgAndUp } = useDisplay()
  const session = useSessionStore()
  const alerts = useAlertsStore()

  const loading = ref(true)
  const connecting = ref(false)
  const checking = ref(false)
  // The Hub return is being confirmed with the Hub (up to ~10 s).
  const completing = ref(false)
  const connected = ref(false)
  const disconnectModalOpen = ref(false)
  const disconnecting = ref(false)
  const accountName = ref('')
  // Titles and texts of the points: the old keys of the backend (`settings.hub.benefits.*`), "One login" with the text that says PanelAlpha Hub.
  const checks = computed(() => [
    { title: t('settings.hub.benefits.monitoring.title'), text: t('settings.hub.benefits.monitoring.text') },
    { title: t('settings.hub.benefits.integrations.title'), text: t('settings.hub.benefits.integrations.text') },
    { title: t('settings.hub.benefits.account.title'), text: t('settings.panelalphaHub.benefits.account.text', { defaultValue: 'One PanelAlpha Hub account for all your servers.' }) },
    { title: t('settings.hub.benefits.go.title', { defaultValue: 'PanelAlpha GO!' }), text: t('settings.hub.benefits.go.text', { defaultValue: 'Install verified apps from the GO! catalog.' }) },
  ])
  // {state, result} of a "pending" answer: the panel keeps the state, so it can be checked again.
  const retry = ref<HubRetry | null>(null)

  const passwordGenerated = computed(() => !!session.user?.password_generated)
  const connectingLabel = computed(() => t(completing.value ? 'settings.hub.confirming' : 'settings.hub.connecting'))

  function showErrors (messages: string[]) {
    for (const errorMessage of messages) {
      alerts.addAlert({ success: false, errorMessage })
    }
  }

  function applyPairing (pairing: HubPairing) {
    connected.value = pairing.connected
    accountName.value = pairing.accountName
  }

  // `/home` is cached and carries `app.hub_paired`, which the user menu reminder reads.
  async function refreshHome () {
    try {
      clearAllCachedGet()
      await session.ensureHome(true)
    } catch {
      // The pairing itself succeeded; the menu catches up on the next reload.
    }
  }

  async function complete (hubReturn: HubRetry) {
    try {
      const outcome = outcomeOf(await completeHub(hubReturn), hubReturn)
      if (outcome.pairing) {
        applyPairing(outcome.pairing)
      }
      if (outcome.refreshHome) {
        await refreshHome()
      }
      if (outcome.toastKey) {
        showErrors([t(outcome.toastKey, { defaultValue: HUB_TOAST_DEFAULTS[outcome.toastKey] })])
      }
      retry.value = outcome.retry
    } catch (error) {
      showErrors(getErrorMessages(error))
      retry.value = retryAfterError(error, retry.value)
    } finally {
      // Never leave the state in the address bar; the rest of the query (Settings' `tab`) stays. Only while Settings is still open: the
      // user may have gone to another page during the confirmation (up to ~10 s), and must not be pulled back.
      if (route.path === '/settings') {
        Promise.resolve(router.replace({ path: '/settings', query: queryWithoutHubReturn(route.query) })).catch(() => {})
      }
    }
  }

  async function checkAgain () {
    if (!retry.value || checking.value) {
      return
    }
    checking.value = true
    try {
      await complete(retry.value)
    } finally {
      checking.value = false
    }
  }

  async function disconnect () {
    if (disconnecting.value) {
      return
    }
    disconnecting.value = true
    try {
      applyPairing(pairingOf(await disconnectHub()))
      disconnectModalOpen.value = false
      await refreshHome()
      alerts.addAlert({ success: true, successMessage: t('settings.panelalphaHub.disconnected', { defaultValue: 'Disconnected from PanelAlpha Hub.' }) })
    } catch (error) {
      // 409: the admin has no password of their own; the same message the modal gives up front.
      const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status
      showErrors(status === 409 ? [t('settings.panelalphaHub.disconnectSetPassword', { defaultValue: DISCONNECT_SET_PASSWORD_DEFAULT })] : getErrorMessages(error))
    } finally {
      disconnecting.value = false
    }
  }

  function setPassword () {
    disconnectModalOpen.value = false
    void router.push('/my-account')
  }

  async function connect () {
    if (connecting.value) {
      return
    }
    connecting.value = true
    try {
      const { link } = await startHub({ admin_url: window.location.origin })
      // The link comes from the API of the panel; only an http(s) address is followed (the wizard checks the same, `connect-step.ts`).
      if (!isHttpUrl(link)) {
        showErrors([t('settings.panelalphaHub.unreachable', { defaultValue: UNREACHABLE_DEFAULT })])
        connecting.value = false
        return
      }
      try {
        window.sessionStorage.setItem(FREE_HUB_RETURN_KEY, 'settings')
      } catch {
        // Without storage the Hub return lands on the wizard step, which still completes the pairing.
      }
      window.location.assign(link)
    } catch (error) {
      showErrors(getErrorMessages(error))
      connecting.value = false
    }
  }

  onMounted(async () => {
    // Only the local status call shows the skeleton; waiting for the Hub shows a button loader.
    try {
      applyPairing(pairingOf(await getHubStatus()))
    } catch (error) {
      showErrors(getErrorMessages(error))
      return
    } finally {
      loading.value = false
    }
    const hubReturn = hubReturnOf(route.query)
    if (hubReturn) {
      completing.value = true
      try {
        await complete(hubReturn)
      } finally {
        completing.value = false
      }
    }
  })
</script>

<style lang="scss" scoped>
// The frame is `FeatureCard` (colours from `--v-feature-card-*`, light and dark); this file keeps only what is the card's own: the warning note
// of the pending state and the red outline of Disconnect.
.hub-note--warning {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgb(var(--v-theme-warning));
}

// The global outlined button (`_buttons.scss`) paints every outlined button grey and primary, whatever its color; Disconnect needs
// the error colour.
.hub-disconnect.v-btn.v-btn--variant-outlined {
  border-color: var(--v-error-base) !important;

  :deep(.v-btn__content) {
    color: var(--v-error-base);
  }

  &:hover {
    background-color: var(--v-error-lighten5) !important;
    border-color: var(--v-error-base) !important;
  }
}
</style>
