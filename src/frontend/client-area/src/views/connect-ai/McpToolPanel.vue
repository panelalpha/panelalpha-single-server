<template>
  <div>
    <PageTitle
      :title="t('heading.connectAi.connectTool', { name: tool.name })"
      title-testid="connect-ai-panel-title"
    />

    <p class="p-3 text--gray-darken1 mt-0 mb-6">
      {{ tool.tag }}
    </p>

    <v-card elevation="4">
      <v-card-text class="text--gray-darken2">
        <div
          class="quick d-flex align-center justify-space-between mb-6"
          data-testid="connect-ai-quick"
        >
          <div class="quick__text d-flex align-center">
            <v-icon
              class="mr-3"
              color="gray"
              icon="$bolt"
              size="22"
            />

            <div>
              <div class="font-weight-bold">
                {{ t('heading.connectAi.oneClickConnect.title') }}
              </div>

              <div class="p-2 text--gray-darken1 mb-0">
                {{ t('heading.connectAi.oneClickConnect.subtitle') }}
              </div>
            </div>
          </div>

          <v-chip
            class="quick__badge ma-0"
            label
            size="small"
            variant="outlined"
          >
            {{ t('general.comingSoon') }}
          </v-chip>
        </div>

        <div
          v-if="tool.special === 'claude'"
          class="connect-ai-claude-notice"
          data-testid="connect-ai-claude-notice"
        >
          <div class="d-flex align-start">
            <v-icon
              class="mr-3"
              color="gray"
              icon="$lock"
              size="19"
            />

            <div class="flex-grow-1">
              <div class="font-weight-600 mb-2">
                {{ t('heading.connectAi.instructions.claude.appTitle') }}
              </div>

              <p class="text--gray-darken2 mb-3">
                {{ t('heading.connectAi.instructions.claude.appBody') }}
              </p>

              <p class="text--gray-darken2 mb-0">
                {{ t('heading.connectAi.instructions.claude.appAlt') }}
              </p>

              <AppButton
                class="mt-4"
                data-testid="connect-ai-claude-code-instead"
                kind="primary"
                @click="emit('go-claude-code')"
              >
                <v-icon
                  class="mr-2"
                  icon="$terminal"
                  size="18"
                />
                {{ ' ' + t('heading.connectAi.instructions.claude.setUpCodeInstead') }}
              </AppButton>
            </div>
          </div>
        </div>

        <template
          v-for="(step, idx) in tool.steps"
          :key="idx"
        >
          <v-divider
            v-if="idx > 0"
            class="my-4"
          />

          <mcp-step
            :num="idx + 1"
            num-test-id="connect-ai-step-num"
            :title="step.title"
            title-test-id="connect-ai-step-title"
          >
            <div
              v-if="step.kind === 'token'"
              class="mt-2 d-flex align-center flex-wrap"
            >
              <AppButton
                data-testid="connect-ai-create-token"
                kind="primary"
                @click="emit('create-token')"
              >
                <v-icon
                  class="mr-2"
                  icon="$bolt"
                  size="18"
                />
                {{ ' ' + t('heading.connectAi.createToken') }}
              </AppButton>

              <span
                v-if="hasActiveToken"
                class="mx-3"
              >{{ t('heading.connectAi.or') }}</span>

              <a
                v-if="hasActiveToken"
                class="text-primary font-weight-600"
                data-testid="connect-ai-use-existing"
                href="#"
                @click.prevent="emit('go-tokens')"
              >{{ t('heading.connectAi.tool.useExistingToken') }}</a>
            </div>

            <div
              v-else-if="step.kind === 'url'"
              class="well well--gray d-flex align-center py-2 px-4 mt-2"
            >
              <mcp-code data-testid="connect-ai-url">
                {{ mcpUrl }}
              </mcp-code>

              <copy-text-button
                color="gray"
                size="16"
                :text="mcpUrl"
              />
            </div>

            <div v-else-if="step.kind === 'code'">
              <div class="well well--gray py-2 px-4 mt-2">
                <div class="d-flex align-start">
                  <mcp-code
                    block
                    data-testid="connect-ai-code"
                    :html="renderMcpCode(step.code)"
                  />

                  <copy-text-custom-button
                    class="flex-shrink-0"
                    :text="step.code"
                  >
                    <AppButton
                      class="ml-auto"
                      data-testid="connect-ai-copy"
                      kind="setting-action"
                    >
                      {{ t('button.copy') }}
                    </AppButton>
                  </copy-text-custom-button>
                </div>
              </div>

              <p
                v-if="step.code.includes('YOUR_TOKEN')"
                class="p-2 text--gray-darken1 mb-0 mt-2"
              >
                {{ t('heading.connectAi.instructions.replaceToken') }}
              </p>
            </div>

            <p
              v-else
              v-safe-html="step.body"
              class="p-2 mb-0 mt-1"
            />
          </mcp-step>
        </template>

        <div
          v-if="tool.docs"
          class="mt-6"
        >
          <AppButton
            class="pl-0"
            data-testid="connect-ai-docs"
            :href="tool.docs"
            kind="link"
            rel="noopener"
            target="_blank"
          >
            <v-icon
              class="mr-2"
              icon="$filetext"
              size="18"
            />
            {{ t('heading.connectAi.tool.readDocs') }}
            <v-icon
              class="ml-1"
              icon="$arrowRightUp"
              size="16"
            />
          </AppButton>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import type { ToolConfig } from './connect-ai-tools'
  // One tool's header, the "One-click connect" banner and its numbered steps.
  import { useTranslation } from 'i18next-vue'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import CopyTextCustomButton from '@/shared/ui/buttons/CopyTextCustomButton.vue'
  import McpCode from '@/shared/ui/mcp/McpCode.vue'
  import McpStep from '@/shared/ui/mcp/McpStep.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { renderMcpCode } from './mcp-code'

  defineProps<{
    tool: ToolConfig
    mcpUrl: string
    hasActiveToken?: boolean
  }>()
  const emit = defineEmits<{
    'create-token': []
    'go-tokens': []
    'go-claude-code': []
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;
@use 'sass:map';

// The icon inherits the button colour. V2 also kept the space between the icon and the label (`.v-btn__content` is
// `white-space: break-spaces`), which V3 compiles away: it is written out in the template.
.v-btn .v-icon {
  color: inherit !important;
}

// V2 `.v-card__text:last-child` kept its 24px bottom padding; V4 ends the card with `.v-card__overlay`, so the text is no longer the last child.
.v-card-text {
  padding-bottom: 24px;
}

// V2 `outlined small label` chip: 24px high, 12px side padding, 20px line and the V2 theme text and border colours
// (V4 outlines with `currentColor` and pads 10px).
.v-chip {
  height: 24px;
  padding: 0 12px;
  line-height: 20px;
  color: var(--v-text-default);
  border-color: var(--v-chip-outlined-border);
}

// V4 text variant paints the border colour black.
.v-btn.pl-0 {
  border-color: currentColor;
}

// The V4 chip is `overflow: hidden` + `nowrap`, so in a narrow row it shrank and cut the label ("Coming Soan").
// The badge keeps its width and the text column shrinks (and wraps) instead.
.quick__badge {
  flex-shrink: 0;
}

.quick__text {
  min-width: 0;
}

.quick {
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--v-gray-lighten3);
  border-radius: 4px;
  background: var(--v-gray-lighten6);
}

// Legacy also set `background: map.get($primary, lighten5)`, a key the palette does not have (never emitted).
.mcp-code :deep(.tok-ph) {
  color: map.get(v.$primary, darken1);
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 700;
}

.connect-ai-claude-notice {
  background-color: var(--v-gray-lighten6);
  border: 1px solid var(--v-gray-lighten3);
  border-radius: 4px;
  padding: 16px 18px;

  p {
    line-height: 1.6;
  }
}

.v-theme--dark .step :deep(.step__num) {
  background-color: var(--v-mcp-step-num-dark-bg);
  color: var(--v-primary-base);
}

@media (max-width: 767px) {
  // Legacy also set `align-items: flex-start`, but the template's `align-center` (`!important`) won in V2 and wins now, so it is omitted.
  .quick {
    flex-direction: column;
  }
}
</style>
