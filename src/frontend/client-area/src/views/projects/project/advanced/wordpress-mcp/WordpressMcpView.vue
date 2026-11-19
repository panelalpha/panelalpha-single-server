<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.wordpressMcp.title')">
      <v-col
        class="pb-2"
        cols="12"
      >
        <SettingCard
          :description="t('heading.instance.advanced.wordpressMcp.description')"
          :loading="fetching"
          :title="t('heading.instance.advanced.wordpressMcp.title')"
        >
          <template
            v-if="!isOn && state !== 'failed'"
            #alert
          >
            <AlertSm
              class="alert-sm--primary"
              :text="t('heading.instance.advanced.wordpressMcp.pluginRequiredHint')"
            />
          </template>

          <template #action>
            <ButtonSwitch
              :aria-label="t('heading.instance.advanced.wordpressMcp.title')"
              class="mt-0"
              :disabled="isBusy"
              :loading="isBusy"
              :model-value="isOn"
              @click="toggle"
            />
          </template>

          <template
            v-if="state === 'failed'"
            #footer
          >
            <div class="d-flex align-center">
              <v-icon
                class="mr-2 error-icon"
                color="error"
                size="18"
              >$alertcircle</v-icon>

              <span class="text-error p-sm">{{ t('heading.instance.advanced.wordpressMcp.failed') }}</span>
            </div>
          </template>
        </SettingCard>
      </v-col>

      <v-col
        v-if="state === 'active' || state === 'endpoint_unavailable'"
        class="pb-2"
        cols="12"
      >
        <v-card elevation="4">
          <v-card-text class="pb-6 text-gray-darken-2">
            <h6 :class="documentationUrl ? 'mb-2' : 'mb-4'">
              {{ t('heading.instance.advanced.wordpressMcp.howToConnect') }}
            </h6>

            <p
              v-if="documentationUrl"
              class="mb-4"
            >
              <a
                class="text-info"
                :href="documentationUrl"
                rel="noopener"
                target="_blank"
              >{{ t('heading.instance.advanced.wordpressMcp.documentationLink') }}</a>
            </p>

            <mcp-step
              :num="1"
              :title="t('heading.instance.advanced.wordpressMcp.step1Title')"
            >
              <p
                v-safe-html="t('heading.instance.advanced.wordpressMcp.step1Body')"
                class="mb-0 mt-1"
              />

              <template #action>
                <div class="step__action">
                  <AppButton
                    block
                    :disabled="wpAdminLoading"
                    kind="setting-action"
                    :loading="wpAdminLoading"
                    @click="openWpAdmin"
                  >
                    {{ t('heading.instance.advanced.wordpressMcp.step1Link') }}
                  </AppButton>
                </div>
              </template>
            </mcp-step>

            <v-divider class="my-4" />

            <mcp-step
              :num="2"
              :title="t('heading.instance.advanced.wordpressMcp.step2Title')"
            >
              <div class="well well--gray d-flex align-center py-2 px-4 mt-2">
                <mcp-code>{{ endpoint }}</mcp-code>

                <CopyTextButton
                  color="info"
                  size="16"
                  :text="endpoint ?? undefined"
                />
              </div>
            </mcp-step>

            <v-divider class="my-4" />

            <mcp-step
              :num="3"
              :title="t('heading.instance.advanced.wordpressMcp.step3Title')"
            >
              <p
                v-safe-html="t('heading.instance.advanced.wordpressMcp.step3Body')"
                class="mb-0 mt-1"
              />

              <div class="well well--gray py-2 px-4 mt-2">
                <div class="d-flex align-start">
                  <mcp-code block>{{ configJson }}</mcp-code>

                  <CopyTextCustomButton
                    class="flex-shrink-0"
                    :text="configJson ?? undefined"
                  >
                    <AppButton
                      class="ml-auto"
                      kind="setting-action"
                    >
                      {{ t('heading.instance.advanced.wordpressMcp.copy') }}
                    </AppButton>
                  </CopyTextCustomButton>
                </div>
              </div>
            </mcp-step>

            <template v-if="state === 'endpoint_unavailable'">
              <v-divider class="my-4" />

              <div class="d-flex align-center text-warning">
                <v-icon
                  class="mr-2 warning-icon"
                  color="warning"
                  size="18"
                >$alertcircle</v-icon>

                <span>{{ t('heading.instance.advanced.wordpressMcp.endpointUnavailable') }}</span>
              </div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </AdvancedPageLayout>

    <ActionModalHost
      :modal="modal"
      :open="modalOpen"
      :persistent="modalPersistent"
      :render="modalRender"
      :submitting="modalSubmitting"
      :values="modalValues"
      :width="modal?.width"
      @button="onModalButton"
      @close="modalClose"
      @update:values="setModalValues"
    />
  </div>
</template>

<script lang="ts" setup>
  // The same file in app and app-lite. The title, the skeleton, the main card with its switch and the `failed` block, and the "How to connect"
  // card come from the page. The switch runs the enable / disable flow; the disable confirmation is the dialog of `buildDisableMcpModal`.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import { createSsoUrl } from '@/entities/project/instance-actions.api'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { popupBlocked } from '@/shared/browser/popup'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import { useSessionStore } from '@/shared/session/session.store'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import CopyTextCustomButton from '@/shared/ui/buttons/CopyTextCustomButton.vue'
  import McpCode from '@/shared/ui/mcp/McpCode.vue'
  import McpStep from '@/shared/ui/mcp/McpStep.vue'
  import { useActionModal } from '@/shared/ui/modal/use-action-modal'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import { useWordpressMcp } from './use-wordpress-mcp'
  import { buildDisableMcpModal } from './wordpress-mcp-modal'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()

  const { state, endpoint, configJson, fetching, isOn, isBusy, fetchStatus, enable, disable } = useWordpressMcp(() => props.instance.id)

  // The one dialog of the page. The confirm closes the dialog before the request (legacy order).
  const {
    modal,
    modalOpen,
    submitting: modalSubmitting,
    render: modalRender,
    values: modalValues,
    persistent: modalPersistent,
    open: openModal,
    close: modalClose,
    setValues: setModalValues,
    onButton: onModalButton,
  } = useActionModal<null>({
    'wordpress-mcp-disable': {
      busy: false,
      run: (_values, ctx) => {
        ctx.close()
        void disable()
      },
    },
  })

  /** Nothing while busy, the confirmation when on, otherwise enable right away. */
  function toggle (): void {
    if (isBusy.value) {
      return
    }
    if (isOn.value) {
      openModal(buildDisableMcpModal(t))
      return
    }
    void enable()
  }

  // `store.state.home.app.documentation_link`.
  const documentationUrl = computed(() => String(session.home?.app?.documentation_link ?? ''))

  const wpAdminLoading = ref(false)

  /** SSO as user 1 into a new tab; a blocked popup navigates the current tab instead. */
  async function openWpAdmin (): Promise<void> {
    wpAdminLoading.value = true
    try {
      const { sso_url: ssoUrl } = await createSsoUrl(props.instance.id, 1)
      const newWindow = window.open(ssoUrl, '_blank')
      if (popupBlocked(newWindow)) {
        window.location.href = ssoUrl
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      wpAdminLoading.value = false
    }
  }

  onMounted(() => {
    void fetchStatus()
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `.v-btn__content` is `flex: 1 0 auto`, so the label of a block button fills it (V4 centres a content-sized box). The button fills the
// 180px action column: V2 `.v-btn--block` was `min-width: 100%`, which the global `.v-btn--default { min-width: 71px }` outranks, so `width`.
.step__action :deep(.v-btn--block) {
  width: 100%;

  .v-btn__content {
    flex: 1 0 auto;
  }
}

// Legacy `.mcp-code` here has no `!important`, so V2's `code` rule shows through on the endpoint (`.theme--light.v-application code`: 5 % black,
// radius 3px; dark 10 % white). `.well code.mcp-code` outweighs the shared `.mcp-code`.
.well code.mcp-code {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 3px;
}

.v-theme--dark .well code.mcp-code {
  background: rgba(var(--v-theme-on-surface), 0.1);
}

// The action column keeps 180px on desktop.
.step__action {
  flex-shrink: 0;
  min-width: 180px;
}

// The inline path in the step text.
.step :deep(.step__body .mcp-path) {
  font-family: ui-monospace, Menlo, monospace;
  background: map.get(v.$gray, lighten6);
  border: 1px solid map.get(v.$gray, lighten3);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 12.5px;
  color: map.get(v.$gray, darken1);
}

// Legacy dark colours were global under `body.is-dark`; they stay scoped here so they do not reach Connect AI. Values: `--v-mcp-*` tokens.
.v-theme--dark .step :deep(.step__body .mcp-path) {
  background-color: var(--v-mcp-path-bg);
  border-color: var(--v-mcp-path-border);
  color: var(--v-mcp-path-text);
}

.v-theme--dark .step :deep(.step__num) {
  background-color: var(--v-mcp-step-num-bg);
  color: var(--v-mcp-step-num-text);
}

// V2 `color="warning"` on the icon was `.warning--text` (`!important`); the global `.v-icon` colour beats V4's layered `text-warning`.
.v-icon.warning-icon {
  color: rgb(var(--v-theme-warning));
}

// Same reason as `warning-icon`, for the `failed` block of the main card.
.v-icon.error-icon {
  color: rgb(var(--v-theme-error));
}

@media (max-width: 767px) {
  .step__action {
    align-self: stretch;
    min-width: 0;
    width: 100%;
  }
}
</style>
