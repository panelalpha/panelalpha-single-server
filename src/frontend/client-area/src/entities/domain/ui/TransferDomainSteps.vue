<template>
  <v-card-text class="px-10 pt-8">
    <AlertBox
      v-if="errorMessage"
      class="mb-6"
      data-testid="transfer-error"
      variant="alert"
    >
      <span class="font-weight-600 mb-0">{{ errorMessage }}</span>
    </AlertBox>

    <h6 class="p-2 font-weight-light">
      <i18next :translation="t('heading.onboarding.transferDomain.subtitle')">
        <template #domain>
          <span class="font-weight-600">{{ domain }}</span>
        </template>
      </i18next>
    </h6>

    <template v-if="transferEnabled">
      <div class="p-2 mt-2 text-justify text-darken-1">
        <p class="mb-4 text-darken-1">
          <i18next :translation="t('heading.onboarding.transferDomain.message.possible.title')">
            <template #domain>
              <span class="font-weight-800">{{ domain }}</span>
            </template>
          </i18next>
        </p>

        <p class="mb-3 text-darken-1">
          {{ t('heading.onboarding.transferDomain.message.possible.stepsTitle') }}
        </p>

        <ol class="pl-4">
          <li class="mb-1 text-darken-1">
            <i18next :translation="t('heading.onboarding.transferDomain.message.possible.step1')">
              <template #domain>
                <span class="font-weight-800">{{ domain }}</span>
              </template>
            </i18next>
          </li>

          <li class="mb-1 text-darken-1">
            <i18next :translation="t('heading.onboarding.transferDomain.message.possible.step2WithHost')">
              <template #domain>
                <span class="font-weight-800">{{ record?.name }}</span>
              </template>

              <template #recordHost>
                <span class="font-weight-800">@</span>
              </template>

              <template #recordType>
                <span class="font-weight-800">{{ record?.type }}</span>
              </template>
            </i18next>
          </li>

          <li class="mb-1 text-darken-1">
            {{ t('heading.onboarding.transferDomain.message.possible.step3') }}
          </li>

          <li class="text-darken-1">
            {{ t('heading.onboarding.transferDomain.message.possible.step4') }}
          </li>
        </ol>
      </div>

      <LongValueBox
        v-if="record?.content"
        :can-expand="false"
        class="mt-4"
        :value="record.content"
      />
    </template>

    <p
      v-else
      class="p-3 mt-2"
    >
      {{ t('heading.onboarding.transferDomain.message.impossible') }}
    </p>
  </v-card-text>
</template>

<script lang="ts" setup>
  // The content of the domain transfer step of the onboarding (`OnboardingDomainTransferModal`),
  // hosting Domains (`TransferDomainModal`) and step 2 of Set domain (`SetYourDomainModal`).
  // The look is the same in all three. The modal keeps its shell, title, buttons, `verifyDomain` call and the `verificationRequired` message.
  import { useTranslation } from 'i18next-vue'
  import AlertBox from '@/shared/ui/alert-box/AlertBox.vue'
  import LongValueBox from '@/shared/ui/labels/LongValueBox.vue'

  defineProps<{
    /** The domain the user transfers (subtitle, title and step 1). */
    domain?: string | null
    /** The DNS record of the verify answer (`verification_record`), as the modal holds it. */
    record?: { name?: string, type?: string, content?: string } | null
    /** The plan allows the transfer: the steps; otherwise the "impossible" copy. */
    transferEnabled: boolean
    /** The error of the last "Transfer now"; empty hides the alert. */
    errorMessage?: string
  }>()

  const { t } = useTranslation()
</script>
