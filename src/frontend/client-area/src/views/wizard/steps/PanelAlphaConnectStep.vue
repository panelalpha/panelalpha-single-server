<template>
  <WizardStepFrame
    :description="t('setup.wizard.connect.chooseSub', { defaultValue: 'Pick one. You\'ll set the server name on the next step.' })"
    :step="stepNumber('panelalpha-connect')"
    :title="t('setup.wizard.connect.chooseHeading', { defaultValue: 'How do you want to sign in?' })"
  >
    <div class="connect-choose">

      <div
        v-if="state === 'completing'"
        class="hub-status"
        data-testid="wizard-hub-status"
      >
        <div class="hub-status__icon">
          <WizardBenefitIcon />
        </div>

        <div class="hub-status__body">
          <b>{{ t('setup.wizard.connect.completingTitle', { defaultValue: 'Connecting to PanelAlpha Hub…' }) }}</b>

          <v-skeleton-loader
            class="hub-status__skeleton"
            data-testid="wizard-hub-skeleton"
            type="text"
          />
        </div>
      </div>

      <div
        v-else-if="message"
        class="hub-alert"
      >
        <p
          class="hub-alert__text"
          data-testid="wizard-connect-error"
          role="alert"
        >
          {{ message }}
        </p>

        <div class="hub-alert__actions">
          <AppButton
            class="hub-alert__button"
            data-testid="wizard-connect-retry"
            :disabled="busy"
            kind="secondary"
            size="small"
            @click="mainAction"
          >
            {{ retry ? t('setup.wizard.connect.checkAgain', { defaultValue: 'Check again' }) : t('setup.wizard.connect.tryAgain', { defaultValue: 'Try again' }) }}
          </AppButton>

          <router-link
            v-if="failure === 'unsupported'"
            class="connect-quiet__link"
            data-testid="wizard-connect-use-local"
            :to="localPath"
          >
            {{ t('setup.wizard.connect.useLocal', { defaultValue: 'Create a local account' }) }}
          </router-link>
        </div>
      </div>

      <WizardHubCard
        :disabled="state === 'completing'"
        :loading="busy || state === 'completing'"
        @connect="start"
      />

      <p class="connect-quiet">
        {{ t('setup.wizard.connect.localPrompt', { defaultValue: 'Prefer not to?' }) }}
        <router-link
          class="connect-quiet__link"
          data-testid="wizard-connect-local"
          :to="localPath"
        >
          {{ t('setup.wizard.connect.localLink', { defaultValue: 'Create a local account instead' }) }}
        </router-link>
      </p>
    </div>
  </WizardStepFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { assignLocation } from '@/views/wizard/browser-location'
  import {
    completeConnect,
    type ConnectDeps,
    type ConnectState,
    failureCopy,
    type HubReturn,
    loadConnectStatus,
    startConnect,
  } from '@/views/wizard/connect-step'
  import WizardBenefitIcon from '@/views/wizard/icons/WizardBenefitIcon.vue'
  import { pathOfSlug, stepIndex, stepNumber } from '@/views/wizard/wizard-steps'
  import { defaultServerName } from '@/views/wizard/wizard.api'
  import { useWizardStore } from '@/views/wizard/wizard.store'
  import WizardHubCard from '@/views/wizard/WizardHubCard.vue'
  import WizardStepFrame from '@/views/wizard/WizardStepFrame.vue'
  import { hubReturnOf, queryWithoutHubReturn } from '@/entities/hub/hub-connection'
  import { completeHub, getHubStatus, startHub } from '@/entities/hub/hub.api'
  import { clearAllCachedGet } from '@/shared/api/cached-get'
  import { fetchCsrfCookie } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  // Step 1 of the wizard: the choice of the sign-in, the card "Connect with Hub" or a local account.
  // The Hub brings the browser back to this step with `state` and `result`; the step takes them out of the address bar and confirms the
  // pairing. The calls are the Community panel ones (`/community/hub*`), as in Settings.
  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()
  const wizard = useWizardStore()

  const localPath = pathOfSlug('general-config')

  const state = ref<ConnectState>('idle')
  const busy = ref(false)
  const failure = ref('')
  // The messages of a failed start (a network or server error), shown like a failed pairing.
  const startErrors = ref<string[]>([])
  // `{ state, result }` of a "pending" answer: the panel keeps the state, so it can be checked again.
  const retry = ref<HubReturn | null>(null)

  const message = computed(() => {
    if (startErrors.value.length > 0) {
      return startErrors.value.join(' ')
    }
    if (failure.value) {
      const { key, defaultValue } = failureCopy(failure.value)
      return t(key, { defaultValue })
    }
    return ''
  })
  const deps: ConnectDeps = {
    fetchCsrfCookie,
    getFreeHub: getHubStatus,
    startFreeHub: (adminUrl, serverName) => startHub({ admin_url: adminUrl, server_name: serverName }),
    completeFreeHub: (state, result) => completeHub({ state, result }),
    assignLocation,
    // A guest is signed in by the panel on `complete` (it creates the admin), so the session is read again, not just /home.
    refreshHome: async () => {
      clearAllCachedGet()
      return session.remoteAuthCheck()
    },
  }

  // The pairing is done: the Hub account is the admin, so the step is over and step 2 names the server (`hub` mode).
  async function markConnected (hubUrl: string | null): Promise<void> {
    state.value = 'connected'
    wizard.setHubConnected(true)
    if (hubUrl !== null) {
      wizard.setHubUrl(hubUrl)
    }
    wizard.reach(stepIndex('general-config'))
    await router.push(pathOfSlug('general-config'))
    window.scrollTo(0, 0)
  }

  async function complete (hubReturn: HubReturn): Promise<void> {
    state.value = 'completing'
    failure.value = ''
    startErrors.value = []
    retry.value = null
    const outcome = await completeConnect(hubReturn, deps)
    if (outcome.kind === 'connected') {
      await markConnected(outcome.hubUrl)
    } else if (outcome.kind === 'login') {
      await router.push('/login')
    } else {
      state.value = 'idle'
      failure.value = outcome.failure
      retry.value = outcome.retry
    }
  }

  // On success the browser leaves for the Hub, so `busy` stays on.
  async function start (): Promise<void> {
    busy.value = true
    failure.value = ''
    startErrors.value = []
    retry.value = null
    // A guest has no name yet: the name of the panel (`My Server` before the setup) goes to the Hub, step 2 renames it.
    const outcome = await startConnect(window.location.origin, defaultServerName(session.home), deps)
    if (outcome.kind === 'failed') {
      startErrors.value = outcome.messages
      failure.value = outcome.failure ?? ''
      busy.value = false
    }
  }

  async function mainAction (): Promise<void> {
    if (busy.value) {
      return
    }
    if (retry.value) {
      busy.value = true
      try {
        await complete(retry.value)
      } finally {
        busy.value = false
      }
      return
    }
    await start()
  }

  // The return from the Hub is read once, the address bar is cleaned first, then the pairing is confirmed.
  onMounted(async () => {
    const hubReturn = hubReturnOf(route.query)
    if (hubReturn) {
      state.value = 'completing'
      try {
        await router.replace({ path: route.path, query: queryWithoutHubReturn(route.query) })
      } catch {
        // A failed navigation must not stop the confirmation.
      }
      await complete(hubReturn)
      return
    }
    // Only a guest chooses the sign-in here. A signed-in admin whose server is already paired has nothing to do, and one with a local account
    // is not offered the Hub in the wizard (pairing is in Settings), so both go on to step 2 (a link typed in the address bar).
    const status = await loadConnectStatus(deps)
    if (!session.user) {
      return
    }
    await (status.connected ? markConnected(null) : router.replace(localPath))
  })
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // The line under the card, centred, 14px; the link as a link of admin area (`primary`, semibold, underlined on hover).
  .connect-quiet {
    margin: 20px 0 0;
    color: var(--v-wizard-desc);
    font-size: v.$font-size-sm;
    line-height: 24px;
    text-align: center;
  }

  .connect-quiet__link {
    color: rgb(var(--v-theme-primary));
    font-weight: v.$font-weight-semibold;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
      border-radius: 2px;
    }
  }

  // The box of the pairing in progress.
  .hub-status {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 16px 18px;
    border: 1px solid var(--v-wizard-hub-border);
    border-radius: var(--v-wizard-radius-lg);
  }

  .hub-status__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--v-wizard-hub-icon-bg);
    color: var(--v-wizard-hub-icon);

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .hub-status__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;

    b {
      color: var(--v-wizard-title);
      font-size: 14.5px;
      font-weight: v.$font-weight-semibold;
    }

    span {
      color: var(--v-wizard-desc);
      font-size: 13.5px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    strong {
      color: var(--v-wizard-title);
      font-weight: v.$font-weight-semibold;
    }
  }

  .hub-status__skeleton {
    width: 220px;
    max-width: 100%;
  }

  // The alert of a failed try: the message with the action under it, on the red of the theme, above the card; the box of
  // `.hub-status` (12px radius) and the error text of admin area (`.hub-error`).
  .hub-alert {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 18px;
    border: 1px solid rgba(var(--v-theme-error), 0.4);
    border-radius: var(--v-wizard-radius-lg);
    background: rgba(var(--v-theme-error), 0.06);
  }

  .hub-alert__text {
    margin: 0;
    color: var(--v-wizard-title);
    font-size: v.$font-size-sm;
    line-height: 1.5;
  }

  .hub-alert__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    font-size: v.$font-size-sm;
  }

  // The outlined grey button of admin area ("Previous Step"): the line `gray-lighten3`, the label `gray-darken1`.
  .hub-alert .hub-alert__button.v-btn {
    border-color: var(--v-wizard-ghost-border);
    color: var(--v-wizard-ghost-text);
  }
</style>
