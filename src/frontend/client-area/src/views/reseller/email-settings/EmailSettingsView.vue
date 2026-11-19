<template>
  <div>
    <PageTitle
      :title="t('heading.reseller.page.emailSettings')"
      title-testid="reseller-email-settings-title"
    />

    <v-container class="email-settings px-0 py-0">
      <!-- Legacy wraps the card and Save in `v-form` (a block), so the flex gap of `.email-settings` does not reach them. -->
      <div class="email-settings__form">
        <v-card
          class="mb-8"
          elevation="4"
        >
          <div class="email-settings__container py-6 px-6">
            <v-row
              v-for="(row, rowIndex) in fieldSections.basic.rows"
              :key="`basic-${rowIndex}`"
              no-gutters
            >
              <v-col
                v-for="item in row"
                :key="item.name"
                :cols="item.cols || 12"
                :sm="item.sm"
              >
                <labeled-field :label="t(item.labelKey)">
                  <v-skeleton-loader
                    v-if="fetching"
                    type="list-item"
                  />

                  <v-text-field
                    v-else
                    :aria-label="t(item.labelKey)"
                    class="mb-0"
                    hide-details="auto"
                    :model-value="settings[item.name]"
                    :placeholder="t(item.placeholderKey)"
                    :type="item.type === 'password' ? 'password' : undefined"
                    variant="outlined"
                    @update:model-value="setField(item.name, $event)"
                  />
                </labeled-field>
              </v-col>
            </v-row>

            <div class="email-settings__configuration-container">
              <h6 class="mb-0 font-weight-light">
                {{ t('reseller.emailSettings.serverConfiguration', 'Mail Server Configuration') }}
              </h6>

              <v-row
                v-for="(row, rowIndex) in fieldSections.server.rows"
                :key="`server-${rowIndex}`"
                no-gutters
              >
                <v-col
                  v-for="item in row"
                  :key="item.name"
                  :cols="item.cols || 12"
                  :sm="item.sm"
                >
                  <labeled-field :label="t(item.labelKey)">
                    <v-skeleton-loader
                      v-if="fetching"
                      type="list-item"
                    />

                    <v-select
                      v-else-if="item.type === 'select'"
                      :aria-label="t(item.labelKey)"
                      class="mb-0"
                      hide-details="auto"
                      :items="sslTypeItems"
                      :menu-props="{ offset: 8, contentClass: 'email-settings-ssl-menu' }"
                      :model-value="settings[item.name] || null"
                      :placeholder="t(item.placeholderKey)"
                      variant="outlined"
                      @update:model-value="setField(item.name, $event)"
                    />

                    <v-text-field
                      v-else
                      :aria-label="t(item.labelKey)"
                      class="mb-0"
                      hide-details="auto"
                      :model-value="settings[item.name]"
                      :placeholder="t(item.placeholderKey)"
                      :type="item.type === 'password' ? 'password' : undefined"
                      variant="outlined"
                      @update:model-value="setField(item.name, $event)"
                    />
                  </labeled-field>
                </v-col>
              </v-row>

              <div class="email-settings__configuration-action">
                <AppButton
                  kind="field"
                  :loading="testingConnection"
                  size="large"
                  @click="testConnection"
                >
                  {{ ` ${t('button.testConnection')} ` }}
                </AppButton>

                <AppButton
                  kind="field"
                  size="large"
                  @click="testEmailModal?.open()"
                >
                  {{ ` ${t('button.sendTestEmail')} ` }}
                </AppButton>
              </div>
            </div>
          </div>
        </v-card>

        <AppButton
          kind="primary"
          :loading="submitting"
          size="large"
          @click="submit"
        >
          {{ ` ${t('button.saveChanges')} ` }}
        </AppButton>
      </div>
    </v-container>

    <send-test-email-modal
      ref="testEmailModal"
      :settings="settings"
    />
  </div>
</template>

<script lang="ts" setup>
  // The SMTP settings form of the reseller.
  // The page renders the frame, the skeletons while the GET runs and the loaded form, and runs Save and Test connection and opens the Send test email modal.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import {
    connectionTestAlert,
    EMAIL_SETTINGS_FIELDS,
    type EmailSettingsFieldName,
    EMPTY_EMAIL_SETTINGS,
    groupFieldSections,
    SSL_TYPE_OPTIONS,
    toEmailSettingsForm,
  } from './email-settings'
  import { getEmailSettings, type ResellerEmailSettings, testEmailConnection, updateEmailSettings } from './email-settings.api'
  import SendTestEmailModal from './SendTestEmailModal.vue'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const settings = reactive<ResellerEmailSettings>({ ...EMPTY_EMAIL_SETTINGS })
  // Legacy starts `false` and sets `true` in `mounted`; starting `true` only skips one frame.
  const fetching = ref(true)
  const submitting = ref(false)
  const testingConnection = ref(false)
  const testEmailModal = ref<InstanceType<typeof SendTestEmailModal> | null>(null)

  const fieldSections = computed(() => groupFieldSections(EMAIL_SETTINGS_FIELDS))

  // V2 items were `{ value, text }`; V4 reads `title`.
  const sslTypeItems = computed(() => SSL_TYPE_OPTIONS.map(option => ({
    value: option.value,
    title: option.titleKey ? t(option.titleKey) : (option.title ?? ''),
  })))

  // The text fields hold what the API returned (string, number or null), so the write goes through a loose record.
  function setField (name: EmailSettingsFieldName, value: string | number): void {
    (settings as Record<EmailSettingsFieldName, string | number | null>)[name] = value
  }

  async function fetchSettings (): Promise<void> {
    fetching.value = true
    try {
      Object.assign(settings, toEmailSettingsForm(await getEmailSettings()))
    } catch (error) {
      console.error(error)
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetching.value = false
    }
  }

  // Legacy `validate()` runs on a form without rules, so there is nothing to check.
  async function submit (): Promise<void> {
    submitting.value = true
    try {
      await updateEmailSettings(settings)
      alerts.addAlert({ success: true, successMessage: t('message.alertManager.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  async function testConnection (): Promise<void> {
    testingConnection.value = true
    try {
      alerts.addAlert(connectionTestAlert(await testEmailConnection(settings), t('message.alertManager.success')))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      testingConnection.value = false
    }
  }

  onMounted(() => {
    void fetchSettings()
  })
</script>

<style lang="scss" scoped>
.email-settings {
  display: flex;
  flex-direction: column;
  row-gap: 16px;

  &__container {
    display: flex;
    flex-direction: column;
    row-gap: 16px;
  }

  &__configuration-container {
    display: flex;
    flex-direction: column;
    row-gap: 16px;
    padding: 16px 16px 24px 16px;
    border: 1px solid var(--v-gray-lighten2);
    border-radius: 8px;
    background: var(--v-form-section-bg);

    h6 {
      font-size: 18px;
      line-height: 24px;
    }
  }

  // Legacy `v-form`: a block, so the card and the Save button stack without the flex gap.
  &__form {
    display: block;
  }

  &__configuration-action {
    display: flex;
    gap: 16px;

    @media (max-width: 480px) {
      flex-direction: column;
    }
  }

  // V2 `v-skeleton-loader type="list-item"` is a transparent 48px box; V4 paints the surface and is 44px (16px margin + 12px bone).
  :deep(.v-skeleton-loader) {
    background-color: transparent;
    color: inherit;
  }

  :deep(.v-skeleton-loader__list-item) {
    height: 48px;
    margin: 0;
  }

  // The empty V4 `v-select` has a 25px native input without padding (no selection element), V2 keeps a 41px input with 8px paddings.
  .v-select :deep(.v-field__input) {
    min-height: 41px;
  }

  // The V4 select input is absolute and starts at the content box (8px lower than the V2 one), so it takes the 8px paddings, a -8px shift and the 4px of width V4 leaves out.
  .v-select :deep(.v-field__input input) {
    width: calc(100% + 4px);
    height: 41px;
    padding-block: 8px;
    translate: 0 -8px;
  }

  // Legacy `.row.no-gutters` (horizontal only, `!important`). V4 `.v-row--no-gutters` already zeroes the column gap and `.v-col` has
  // no padding, so the 6px column padding is given explicitly.
  .v-row--no-gutters {
    row-gap: 16px;
    margin-inline: -6px;

    > .v-col {
      padding-inline: 6px;
    }
  }
}
</style>
