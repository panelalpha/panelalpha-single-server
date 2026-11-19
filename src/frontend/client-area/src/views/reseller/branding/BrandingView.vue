<template>
  <div>
    <PageTitle :title="t('heading.reseller.page.branding')" />

    <v-container class="px-0 py-0">
      <v-card
        class="branding-card mb-8"
        elevation="4"
      >
        <v-card-text>
          <v-form>
            <v-row class="branding-form-row mb-2">
              <v-col
                v-for="field of fields"
                :key="field.name"
                class="d-flex flex-column justify-center py-2"
                cols="12"
                sm="6"
              >
                <labeled-field :label="field.label">
                  <!-- Accessible name from the label; legacy has none. -->
                  <v-skeleton-loader
                    v-if="fetching"
                    class="bg-text"
                    type="list-item"
                  />

                  <v-text-field
                    v-else
                    v-model="settings[field.name]"
                    :aria-label="field.label"
                    class="mb-0"
                    hide-details="auto"
                    :placeholder="field.placeholder"
                    variant="outlined"
                  />
                </labeled-field>
              </v-col>
            </v-row>
          </v-form>

          <AppButton
            class="ml-auto mt-4"
            data-testid="branding-manage-styles"
            kind="primary"
            size="large"
            @click="emitAppEvent('style-manager-open')"
          >
            <v-icon
              class="mr-2"
              icon="$settings2"
            />
            {{ ' ' + t('button.branding.manage') + ' ' }}
          </AppButton>
        </v-card-text>
      </v-card>
    </v-container>

    <PageTitle
      v-if="settings.domain"
      :title="t('heading.reseller.page.dnsrecord')"
    />

    <v-container class="px-0 py-0">
      <v-card
        v-if="settings.domain"
        class="branding-card mb-7"
        elevation="4"
      >
        <v-card-text>
          <AppMessage variant="info">
            <p><strong>{{ t('reseller.domain.dnsSetupInfo1') }}</strong>&nbsp;{{ t('reseller.domain.dnsSetupInfo2') }}</p>
          </AppMessage>

          <div class="well well--gray py-3 px-4 mb-2">
            <ul class="record-box-list">
              <copy-record-item
                :label="t('general.name')"
                :value="settings.domain"
              />

              <copy-record-item
                :label="t('general.type')"
                value="CNAME"
              />

              <copy-record-item
                :label="t('general.address')"
                :value="panelDomain"
              />
            </ul>
          </div>
        </v-card-text>
      </v-card>

      <div>
        <AppButton
          class="ml-auto mt-4"
          data-testid="branding-save"
          kind="primary"
          :loading="submitting"
          size="large"
          @click="submit"
        >
          {{ ' ' + t('button.saveChanges') + ' ' }}
        </AppButton>
      </div>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // Brand name and domain form, "Manage Styles" opens the
  // Style Manager drawer, Save is active also while the GET runs.
  // The DNS Record card (heading + alert + CNAME rows) shows while the domain field is non-empty.
  import type { BrandingSettings } from '@/views/reseller/reseller.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { getBrandingSettings, updateBrandingSettings } from '@/views/reseller/reseller.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import CopyRecordItem from '@/shared/ui/record-box/CopyRecordItem.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const settings = ref<BrandingSettings>({ brand_name: '', domain: '' })
  const fetching = ref(false)
  const submitting = ref(false)
  const panelDomain = window.location.hostname

  const fields = computed<Array<{ name: keyof BrandingSettings, label: string, placeholder: string }>>(() => [
    {
      name: 'brand_name',
      label: t('reseller.brandName'),
      placeholder: t('reseller.brandName.placeholder'),
    },
    {
      name: 'domain',
      label: t('reseller.domain'),
      placeholder: t('reseller.domain.placeholder'),
    },
  ])

  async function fetchSettings (): Promise<void> {
    fetching.value = true
    try {
      settings.value = await getBrandingSettings()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetching.value = false
    }
  }

  async function submit (): Promise<void> {
    submitting.value = true
    try {
      await updateBrandingSettings(settings.value)
      alerts.addAlert({ success: true, successMessage: t('message.alertManager.success') })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => {
    void fetchSettings()
  })
</script>

<style lang="scss" scoped>
// Legacy is a plain `.row` with the V2 gutter (margin -16px, `.col-6` padding 16px).
// V4 spaces columns by `gap` and keeps no vertical margin, so the gutter is restated here.
// `mb-2` of the template keeps the legacy 8px under the row; `py-2` of the columns keeps 8px above and below the field.
// The global `.v-card-text:last-child { padding-bottom: 24px }` (`_card.scss`) never matches a V4 card (it ends with `.v-card__overlay`).
.branding-card > .v-card-text:last-of-type {
  padding-bottom: 24px;
}

.branding-form-row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: -16px -16px 8px;

  > .v-col {
    padding: 8px 16px;
  }
}
</style>
