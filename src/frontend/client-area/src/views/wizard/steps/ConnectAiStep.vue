<template>
  <WizardStepFrame
    :description="t('setup.wizard.connectAi.description', { defaultValue: 'Let your AI assistant manage this server.' })"
    :step="stepNumber('connect-ai')"
    :title="t('setup.wizard.connectAi.title', { defaultValue: 'Connect your AI assistant' })"
  >
    <FeatureCard
      :checks="checks"
      data-testid="wizard-ai-status"
      :flag="wizard.aiConnected
        ? t('setup.wizard.connectAi.card.flagConnected', { defaultValue: 'Connected' })
        : t('setup.wizard.connectAi.card.flag', { defaultValue: 'Works with any MCP client' })"
      :ok="wizard.aiConnected"
      :title="wizard.aiConnected
        ? t('setup.wizard.connectAi.connected', { defaultValue: 'AI is connected to this panel.' })
        : t('setup.wizard.connectAi.card.title', { defaultValue: 'Connect with MCP' })"
      :title-testid="wizard.aiConnected ? 'wizard-ai-connected' : 'wizard-ai-title'"
    >
      <template #flag-icon>
        <FeatureCheckIcon
          v-if="wizard.aiConnected"
          class="ai-flag-icon"
        />

        <FeatureStarIcon v-else />
      </template>

      <template #action>
        <AppButton
          block
          data-testid="wizard-ai-create"
          :kind="wizard.aiConnected ? 'secondary' : 'primary'"
          :loading="loadingTokens"
          size="large"
          @click="tokenModal?.open()"
        >
          {{
            wizard.aiConnected
              ? t('setup.wizard.connectAi.createAnother', { defaultValue: 'Create another token' })
              : t('setup.wizard.connectAi.createToken', { defaultValue: 'Create token' })
          }}
        </AppButton>
      </template>

      <template #aside>
        <WizardAiPanel :server-url="serverUrl" />
      </template>
    </FeatureCard>

    <!-- As the row under the facts on Summary: the guide on the left, "later" on the right. -->
    <div class="ai-links">
      <a
        class="ai-docs"
        data-testid="wizard-ai-link"
        :href="CONNECT_AI_DOCUMENTATION_URL"
        rel="noopener"
        target="_blank"
      >
        {{ t('setup.wizard.connectAi.documentation', { defaultValue: 'Documentation' }) }}
        <WizardExternalLinkIcon class="ai-docs__icon" />
      </a>

      <p
        v-if="!wizard.aiConnected"
        class="ai-note"
        data-testid="wizard-ai-later"
      >
        {{ t('setup.wizard.connectAi.later', { defaultValue: 'You can connect your AI assistant later in Connect AI.' }) }}
      </p>
    </div>

    <McpTokenCreateModal
      ref="tokenModal"
      @token-created="wizard.setAiConnected(true)"
    />

    <template #footer>
      <WizardFooter
        :hide-next="!wizard.aiConnected"
        :hide-previous="wizard.aiConnected"
        :previous-label="t('setup.wizard.connectAi.skip', { defaultValue: 'Skip for now' })"
        previous-testid="wizard-ai-skip"
        @next="skip"
        @previous="skip"
      />
    </template>
  </WizardStepFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import WizardExternalLinkIcon from '@/views/wizard/icons/WizardExternalLinkIcon.vue'
  import { CONNECT_AI_DOCUMENTATION_URL } from '@/views/wizard/summary-step'
  import { nextPath, stepNumber } from '@/views/wizard/wizard-steps'
  import { useWizardStore } from '@/views/wizard/wizard.store'
  import WizardAiPanel from '@/views/wizard/WizardAiPanel.vue'
  import WizardFooter from '@/views/wizard/WizardFooter.vue'
  import WizardStepFrame from '@/views/wizard/WizardStepFrame.vue'
  import { hasActiveToken } from '@/entities/mcp/mcp-tokens'
  import { mcpServerUrl } from '@/entities/mcp/mcp-url'
  import { listTokens } from '@/entities/mcp/mcp.api'
  import McpTokenCreateModal from '@/entities/mcp/ui/McpTokenCreateModal.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import FeatureCard from '@/shared/ui/feature-card/FeatureCard.vue'
  import FeatureCheckIcon from '@/shared/ui/feature-card/FeatureCheckIcon.vue'
  import FeatureStarIcon from '@/shared/ui/feature-card/FeatureStarIcon.vue'

  // Step 3 of the wizard: Connect AI, in the card of step 1: what MCP gives and "Create token" on the
  // left, the diagram and the MCP address on the right (`WizardAiPanel`), the guide under the card. An active token (read on entry, or created in the modal) marks AI as connected; "Skip for now" / "Continue" lead to Summary.
  const { t } = useTranslation()
  const router = useRouter()
  const tokenModal = ref<InstanceType<typeof McpTokenCreateModal> | null>(null)
  const serverUrl = mcpServerUrl()
  const wizard = useWizardStore()
  const loadingTokens = ref(true)

  const CHECKS = [
    { key: 'projects', text: 'Manage projects, domains and backups from your AI assistant' },
    { key: 'logs', text: 'Check logs, errors and server usage without opening the panel' },
    { key: 'revoke', text: 'Revoke access at any time in Connect AI' },
  ]

  // A computed, so the lines follow a change of language.
  const checks = computed(() => CHECKS.map(check => t(`setup.wizard.connectAi.card.checks.${check.key}`, { defaultValue: check.text })))

  // A failed GET quietly means "no token" (like `fetchTokens` without `alertOnError`) and keeps what the store knows. A successful GET
  // sets the flag both ways, so a token revoked on `/connect-ai` is not shown as connected. "Create token" waits for the GET.
  onMounted(async () => {
    try {
      wizard.setAiConnected(hasActiveToken(await listTokens()))
    } catch {
      // no token
    } finally {
      loadingTokens.value = false
    }
  })

  async function skip (): Promise<void> {
    await router.push(nextPath('connect-ai'))
    window.scrollTo(0, 0)
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  .ai-flag-icon {
    width: 12px;
    height: 12px;
  }

  // The row under the card, as on Summary (`SummaryStep.vue`, `.summary-links`): it wraps below `sm`, the note goes under the link.
  .ai-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 16px;
  }

  .ai-docs {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--v-wizard-accent);
    font-size: v.$font-size-sm;
    font-weight: v.$font-weight-semibold;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  .ai-docs__icon {
    width: 14px;
    height: 14px;
  }

  .ai-note {
    margin: 0;
    color: var(--v-wizard-desc);
    font-size: v.$font-size-sm;
    line-height: 20px;
    text-align: right;

    @media (max-width: $below-sm) {
      text-align: left;
    }
  }
</style>
