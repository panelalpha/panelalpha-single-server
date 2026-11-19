<template>
  <div
    class="ai-panel"
    data-testid="wizard-ai-panel"
  >
    <div
      aria-hidden="true"
      class="ai-panel__diagram"
    >
      <span class="ai-panel__node">
        <svg
          fill="none"
          height="22"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        {{ t('setup.wizard.connectAi.diagram.assistant', { defaultValue: 'Your AI assistant' }) }}
      </span>

      <span class="ai-panel__link">
        <span class="ai-panel__chip">{{ t('setup.wizard.connectAi.diagram.link', { defaultValue: 'MCP + token' }) }}</span>
        <span class="ai-panel__line" />
      </span>

      <span class="ai-panel__node ai-panel__node--server">
        <svg
          fill="none"
          height="22"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
          viewBox="0 0 24 24"
          width="22"
        >
          <rect
            height="7"
            rx="2"
            width="18"
            x="3"
            y="4"
          />

          <rect
            height="7"
            rx="2"
            width="18"
            x="3"
            y="13"
          />

          <path d="M7 7.5h.01M7 16.5h.01" />
        </svg>
        {{ t('setup.wizard.connectAi.diagram.server', { defaultValue: 'This server' }) }}
      </span>
    </div>

    <div class="ai-panel__address">
      <span class="ai-panel__label">
        {{ t('setup.wizard.connectAi.serverAddress', { defaultValue: 'MCP server address' }) }}
      </span>

      <div class="ai-panel__field">
        <code data-testid="wizard-ai-address">{{ serverUrl }}</code>

        <CopyTextButton
          color="var(--v-wizard-accent)"
          :text="serverUrl"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'

  // The right column of the Connect AI card (`ConnectAiStep.vue`), in the place of the Hub diagram of step 1: a drawn diagram "your AI
  // assistant → MCP + token → this server" and the MCP server address with the copy button, on the gray of `.hub-diagram`.
  defineProps<{
    serverUrl: string
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  .ai-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    border-radius: var(--v-wizard-radius);
    background: var(--v-wizard-diagram-bg);

    @media (max-width: $below-sm) {
      padding: 16px;
    }
  }

  .ai-panel__diagram {
    display: flex;
    gap: 12px;
    align-items: center;

    @media (max-width: $below-sm) {
      gap: 8px;
    }
  }

  // A box of the diagram: white with the frame of the fields; the server is the green of `.hub-status--ok`.
  .ai-panel__node {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 14px 8px;
    border: 1px solid var(--v-wizard-field-border);
    border-radius: var(--v-wizard-radius);
    background: var(--v-wizard-bg);
    color: var(--v-wizard-checker-text);
    font-size: v.$font-size-xs;
    font-weight: v.$font-weight-semibold;
    line-height: 18px;
    text-align: center;

    svg {
      color: var(--v-wizard-hub-icon);
    }
  }

  .ai-panel__node--server {
    border-color: var(--v-wizard-hub-ok-border);
    background: var(--v-wizard-hub-ok-bg);

    svg {
      color: var(--v-wizard-benefit-icon);
    }
  }

  .ai-panel__link {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    width: 96px;

    @media (max-width: $below-sm) {
      width: 72px;
    }
  }

  .ai-panel__chip {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--v-wizard-benefit-bg);
    color: var(--v-wizard-benefit-icon);
    font-size: 11px;
    font-weight: v.$font-weight-bold;
    line-height: 16px;
    white-space: nowrap;
  }

  .ai-panel__line {
    width: 100%;
    border-top: 2px dashed var(--v-wizard-step-border);
  }

  .ai-panel__address {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .ai-panel__label {
    color: var(--v-wizard-label);
    font-size: v.$font-size-xs;
    line-height: 18px;
  }

  // The address in a white field with the frame of the fields; a long address ends with an ellipsis, the copy button stays.
  .ai-panel__field {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 40px;
    padding: 0 4px 0 12px;
    border: 1px solid var(--v-wizard-field-border);
    border-radius: var(--v-wizard-radius);
    background: var(--v-wizard-bg);
    color: var(--v-wizard-title);

    code {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      font-size: v.$font-size-xs;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
