<template>
  <WizardStepFrame
    :description="t('setup.wizard.summary.description', { defaultValue: 'PanelAlpha is ready on this server.' })"
    :step="stepNumber('summary')"
    :title="t('setup.wizard.summary.title', { defaultValue: 'You\'re all set.' })"
  >
    <template #indicator>
      <WizardConfetti />
    </template>

    <div
      class="summary"
      data-testid="wizard-summary-box"
    >
      <dl class="summary-facts">
        <div
          class="summary-facts__row"
          data-testid="wizard-summary-server"
        >
          <dt>{{ t('setup.wizard.summary.serverName', { defaultValue: 'Server name' }) }}</dt>
          <dd>{{ serverName }}</dd>
        </div>

        <div
          class="summary-facts__row"
          data-testid="wizard-summary-account"
        >
          <dt>
            {{ hub === 'connected'
              ? t('setup.wizard.summary.hubAccount', { defaultValue: 'Hub account' })
              : t('setup.wizard.summary.adminEmail', { defaultValue: 'Admin email' }) }}
          </dt>

          <dd>{{ email }}</dd>
        </div>

        <div
          class="summary-facts__row"
          data-testid="wizard-summary-address"
        >
          <dt>{{ t('setup.wizard.summary.panelAddress', { defaultValue: 'Panel address' }) }}</dt>

          <dd class="summary-facts__value--copy">
            {{ panelAddress }}

            <CopyTextButton
              color="var(--v-wizard-accent)"
              :text="panelAddress"
            />
          </dd>
        </div>

        <div
          v-if="edition === 'community'"
          class="summary-facts__row"
          data-testid="wizard-summary-version"
        >
          <dt>{{ t('setup.wizard.summary.version', { defaultValue: 'Version' }) }}</dt>
          <dd>{{ t('setup.wizard.summary.editionCommunity', { defaultValue: 'Community' }) }}</dd>
        </div>

        <div
          v-if="hub !== 'unknown'"
          class="summary-facts__row"
          data-testid="wizard-summary-hub-status"
        >
          <dt>{{ t('setup.wizard.summary.hub', { defaultValue: 'PanelAlpha Hub' }) }}</dt>

          <dd>
            <StatusLabel :status="hub === 'connected' ? 'success' : 'gray'">
              {{ hub === 'connected'
                ? t('setup.wizard.summary.hubConnected', { defaultValue: 'Connected' })
                : t('setup.wizard.summary.hubNotConnected', { defaultValue: 'Not connected' }) }}
            </StatusLabel>
          </dd>
        </div>

        <div
          v-if="ai !== 'unknown'"
          class="summary-facts__row"
          data-testid="wizard-summary-ai-status"
        >
          <dt>{{ t('setup.wizard.summary.ai', { defaultValue: 'AI assistant' }) }}</dt>

          <dd>
            <StatusLabel :status="ai === 'connected' ? 'success' : 'gray'">
              {{ ai === 'connected'
                ? t('setup.wizard.summary.aiConnected', { defaultValue: 'Connected' })
                : t('setup.wizard.summary.aiNotConnected', { defaultValue: 'Not connected' }) }}
            </StatusLabel>
          </dd>
        </div>
      </dl>

      <!-- After a Hub sign-in: the flag and the check lines of the Hub card of step 1, the lines side by side. -->
      <section
        v-if="hub === 'connected'"
        class="summary-hub"
      >
        <FeatureFlag
          as="h3"
          data-testid="wizard-summary-connect-head"
        >
          <template #icon>
            <FeatureCheckIcon class="summary-hub__flag-icon" />
          </template>
          {{ t('setup.wizard.summary.includedWithHub', { defaultValue: 'Included with PanelAlpha Hub' }) }}
        </FeatureFlag>

        <FeatureCheckList
          item-testid="wizard-summary-connect-line"
          :items="hubIncluded"
          row
        />
      </section>

      <!-- Documentation on the left, under the facts as before; the note about Hub on the right of the same row. -->
      <div class="summary-links">
        <a
          class="summary-docs"
          data-testid="wizard-summary-docs"
          :href="DOCUMENTATION_URL"
          rel="noopener"
          target="_blank"
        >
          {{ t('setup.wizard.summary.documentation', { defaultValue: 'Documentation' }) }}
          <WizardExternalLinkIcon class="summary-docs__icon" />
        </a>

        <p
          v-if="hub === 'missing'"
          class="summary-note"
          data-testid="wizard-summary-hub-later"
        >
          <i18next :translation="t('setup.wizard.summary.hubLater', { defaultValue: 'You can connect PanelAlpha Hub later in {settings}.' })">
            <template #settings>
              <router-link to="/settings">
                {{ t('setup.wizard.summary.settingsLink', { defaultValue: 'Settings' }) }}
              </router-link>
            </template>
          </i18next>
        </p>
      </div>
    </div>

    <p
      v-if="errors.length > 0"
      class="summary-error"
      data-testid="wizard-summary-error"
      role="alert"
    >
      {{ errors.join(' ') }}
    </p>

    <WizardFooter
      flat
      hide-previous
      :loading="finishing"
      :next-label="t('setup.wizard.summary.createFirstProject', { defaultValue: 'Create your first project' })"
      @next="finish"
    />
  </WizardStepFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
  import { isNavigationFailure, useRouter } from 'vue-router'
  import WizardExternalLinkIcon from '@/views/wizard/icons/WizardExternalLinkIcon.vue'
  import {
    DOCUMENTATION_URL,
    HUB_INCLUDED_LINES,
    loadSummaryAi,
    loadSummaryHub,
    panelEdition,
    type SummaryAi,
    type SummaryHub,
  } from '@/views/wizard/summary-step'
  import { finishWizard } from '@/views/wizard/wizard-finish'
  import { stepNumber } from '@/views/wizard/wizard-steps'
  import { getWizardSettings } from '@/views/wizard/wizard.api'
  import { useWizardStore } from '@/views/wizard/wizard.store'
  import WizardFooter from '@/views/wizard/WizardFooter.vue'
  import WizardStepFrame from '@/views/wizard/WizardStepFrame.vue'
  import { getHubStatus } from '@/entities/hub/hub.api'
  import { listTokens } from '@/entities/mcp/mcp.api'
  import { clearAllCachedGet } from '@/shared/api/cached-get'
  import { emit } from '@/shared/events/app-events'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import { clearWizardFlow } from '@/shared/session/wizard-path'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import FeatureCheckIcon from '@/shared/ui/feature-card/FeatureCheckIcon.vue'
  import FeatureCheckList from '@/shared/ui/feature-card/FeatureCheckList.vue'
  import FeatureFlag from '@/shared/ui/feature-card/FeatureFlag.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  // Step 4 of the wizard (single-server): the name of the server, the account and, after a Hub sign-in, what PanelAlpha Hub brings (no list
  // after a local account, no "Back", the setup is saved). "Create your first project" finishes the wizard and opens the onboarding on
  // `/projects` (`wizard-finish.ts`). A failed finish is shown above the button; the source sent it to an alert nobody listens to.
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const wizard = useWizardStore()

  // The confetti is a chunk of its own (with `lottie-web`), loaded after the step is on the screen.
  const WizardConfetti = defineAsyncComponent(() => import('@/views/wizard/WizardConfetti.vue'))

  // A computed, so the language footer on this step changes the lines too.
  const hubIncluded = computed(() => HUB_INCLUDED_LINES.map(line => t(`setup.wizard.summary.included.${line.key}`, { defaultValue: line.defaultValue })))

  const hub = ref<SummaryHub>(wizard.hubConnected ? 'connected' : 'unknown')
  const ai = ref<SummaryAi>(wizard.aiConnected ? 'connected' : 'unknown')
  const panelAddress = window.location.origin
  const edition = computed(() => panelEdition(session.home?.app))
  // The name as saved by step 2 (`GET /community/settings`); `/home` read before the save is the fallback.
  const serverName = ref(session.home?.app?.name ?? '')
  const email = computed(() => session.user?.email ?? session.home?.user?.email ?? '')
  const finishing = ref(false)
  const errors = ref<string[]>([])

  async function finish (): Promise<void> {
    if (finishing.value) {
      return
    }
    errors.value = []
    finishing.value = true
    try {
      errors.value = await finishWizard({
        clearCache: clearAllCachedGet,
        ensureHome: () => session.ensureHome(true),
        openStart: async () => {
          const target = preferredSpaBase(session.home)
          const failure = await router.push(target)
          return !isNavigationFailure(failure) && router.currentRoute.value.path === target
        },
        clearFlow: clearWizardFlow,
        refreshServices: () => session.refreshServices(),
        startOnboarding: () => emit('start-installation-process'),
      })
    } finally {
      finishing.value = false
    }
  }

  // After a reload or a visit by the link the wizard store is empty, so the pairing is asked for.
  onMounted(async () => {
    void getWizardSettings()
      .then(settings => {
        if (settings.name) {
          serverName.value = settings.name
        }
      })
      .catch(() => undefined)
    const aiLoaded = loadSummaryAi(wizard.aiConnected, listTokens).then(value => {
      ai.value = value
      if (value !== 'unknown') {
        wizard.setAiConnected(value === 'connected')
      }
    })
    hub.value = await loadSummaryHub(wizard.hubConnected, getHubStatus)
    if (hub.value === 'connected') {
      wizard.setHubConnected(true)
    }
    await aiLoaded
  })
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // Two cards in the boxes of admin area (1px frame, 12px radius): the facts of the setup on white,
  // then what PanelAlpha Hub brings on the green of the connected status.
  .summary {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  // The facts: one row each, the label in `gray-darken1` on the left, the value in `gray-darken4` 600 on the right, a line between the rows.
  .summary-facts {
    margin: 0;
    padding: 0 24px;
    border: 1px solid var(--v-wizard-field-border);
    border-radius: var(--v-wizard-radius-lg);
    background: var(--v-wizard-bg);
    font-size: v.$font-size-sm;
    line-height: 22px;
  }

  .summary-facts__row {
    display: flex;
    gap: 16px;
    align-items: baseline;
    justify-content: space-between;
    padding: 16px 0;

    & + & {
      border-top: 1px solid var(--v-wizard-field-border);
    }

    dt {
      flex: none;
      color: var(--v-wizard-desc);
    }

    dd {
      min-width: 0;
      margin: 0;
      color: var(--v-wizard-title);
      font-weight: v.$font-weight-semibold;
      text-align: right;
      overflow-wrap: anywhere;
    }
  }

  // Panel address: the copy button (margin from the kit) sits right of the text, vertically centred.
  .summary-facts__row dd.summary-facts__value--copy {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  // Wraps below `sm`: the note goes under the link.
  .summary-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    align-items: baseline;
    justify-content: space-between;
  }

  .summary-note {
    margin: 0;
    text-align: right;

    @media (max-width: $below-sm) {
      text-align: left;
    }
    color: var(--v-wizard-desc);
    font-size: v.$font-size-sm;
    line-height: 20px;

    a {
      color: var(--v-wizard-accent);
    }
  }

  .summary-docs {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--v-wizard-accent);
    font-size: v.$font-size-sm;
    font-weight: v.$font-weight-semibold;
    text-decoration: none;
  }

  .summary-docs__icon {
    width: 14px;
    height: 14px;
  }

  // The frame of the Hub card of step 1 (`FeatureCard.vue`: 1px `primary`, the flag over the top edge), without the title: the
  // flag names the card.
  .summary-hub {
    position: relative;
    margin-top: 13px;
    padding: 30px 24px 22px;
    border: 1px solid var(--v-wizard-hub-card-border);
    border-radius: var(--v-wizard-radius-lg);
    background: var(--v-wizard-bg);

    @media (max-width: $below-sm) {
      padding: 28px 16px 16px;
    }
  }

  // The check of the flag of the Connect AI card once connected (`ConnectAiStep.vue`, `.ai-flag-icon`).
  .summary-hub__flag-icon {
    width: 12px;
    height: 12px;
  }

  .summary-error {
    margin: 24px 0 0;
    color: rgb(var(--v-theme-error));
  }
</style>
