<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-super-quick-progress-modal"
    fullscreen
    :model-value="modelValue"
  >
    <ProgressScreen>
      <ProgressCard
        bar-tone="brand"
        :status="progressStatus"
      >
        <template #logo>
          <BrandLogo
            compact
            :dark-logo="themeStore.darkLogo"
            :logo="themeStore.lightLogo"
          />
        </template>

        <template #title>
          <span
            v-if="!error && completed"
            class="text-center text-primary"
          >
            {{ t('heading.onboarding.installation.title.completed') }}
          </span>

          <span
            v-else-if="error && completed"
            class="text-center text-error"
          >
            {{ t('heading.onboarding.installation.title.failed') }}
          </span>

          <span
            v-if="!completed"
            class="text-center"
          >
            {{ t('heading.onboarding.installation.subtitle.inProgress') }}
          </span>

          <span
            v-else-if="!error"
            class="text-center"
          >
            {{ t('heading.onboarding.installation.subtitle.completed') }}
          </span>

          <span
            v-else-if="error"
            class="text-center"
          >
            {{ t('heading.onboarding.installation.subtitle.failed') }}
          </span>
        </template>

        <img
          v-if="!completed"
          alt=""
          :src="partialLogoUrl"
        >

        <img
          v-if="completed && !error && !redirecting"
          alt=""
          :src="checkUrl"
        >

        <DotLoader v-else-if="completed && !error && redirecting" />

        <img
          v-if="completed && error"
          alt=""
          :src="failedUrl"
        >

        <!-- Legacy: two blank 315 px frames (no screenshot), the first hidden on error, the second shown on error. -->
        <template #media>
          <v-img
            v-show="!error"
            height="315px"
            position="center top"
            width="100vw"
          />

          <v-img
            v-show="error && completed"
            height="315px"
            position="center top"
            width="100vw"
          />
        </template>

        <template #actions>
          <div
            v-if="installedInstanceDnsMismatch"
            class="success-box mt-8"
          >
            <p class="font-weight-600 mb-0">
              <i18next :translation="t('heading.onboarding.installation.info.setDnsRecords')">
                <template #domain>
                  <a
                    class="font-weight-600"
                    :href="installed?.url ?? undefined"
                    target="_blank"
                  >{{ installed?.domain }}</a>
                </template>
              </i18next>
            </p>

            <DnsOptions
              :cdn-dns-records="installed?.cdn_dns_records ?? []"
              :cdn-pending="cdnPending"
              class="mt-3 installation-card__dns"
              :dns-server-records="installed?.domain_zone?.details?.configuration_records ?? []"
              :dns-settings="installed?.dns_settings"
              :domain="installed?.domain ?? ''"
              :has-dns-server="installed?.service_has_dns"
              hide-title
              :host-c-names="installed?.host_c_names ?? []"
              :ipv4-addresses="installed?.host_ipv4_addresses ?? []"
              :nameservers="installed?.domain_zone?.details?.nameservers ?? []"
              :onboarding-subdomain="installed?.onboarding_subdomain"
            />
          </div>

          <p
            v-if="!error && !installedInstanceDnsMismatch"
            class="p-1 pt-8 mb-0 text-center heading--text"
          >
            {{ infoText }}
          </p>

          <div
            class="d-flex pt-8"
            :class="mdAndDown ? 'flex-column' : ''"
          >
            <AppButton
              v-if="showButtons && !error"
              class="btn-xx-large"
              :class="mdAndDown ? 'mr-0' : ''"
              color="gray"
              elevation="0"
              size="x-large"
              variant="outlined"
              width="210px"
              @click="emit('go-to-dashboard')"
            >
              <span class="heading--text">{{ t('button.dashboard.back') }}</span>
            </AppButton>

            <AppButton
              v-if="error"
              class="btn-xx-large"
              :class="mdAndDown ? 'ml-0 mt-4' : ''"
              color="gray"
              elevation="0"
              size="x-large"
              variant="outlined"
              width="210px"
              @click="emit('try-again')"
            >
              <span class="heading--text">{{ t('button.try') }}</span>
            </AppButton>

            <AppButton
              v-if="completed && error"
              class="btn-xx-large mb-10"
              :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
              kind="primary"
              size="x-large"
              width="210px"
              @click="emit('go-to-dashboard')"
            >
              {{ t('button.dashboard.back') }}
            </AppButton>

            <!-- "Start Creating" opens the new project once it is installed. Legacy kept it disabled in
                   every state the flow reaches (`!showStartCreatingButton || !error`) and sent a click to the WP admin SSO. -->
            <AppButton
              v-else
              class="btn-xx-large mb-10"
              :class="mdAndDown ? 'ml-0 mt-4' : 'ml-6'"
              data-testid="onboarding-super-quick-start-creating"
              :disabled="!showStartCreatingButton || error || !installed"
              kind="primary"
              size="x-large"
              width="210px"
              @click="startCreating"
            >
              {{ t('button.startCreating') }}
            </AppButton>
          </div>
        </template>
      </ProgressCard>
    </ProgressScreen>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { OnboardingService } from '@/views/onboarding/onboarding-service'
  // The progress of a simple service. The SSO redirect
  // runs in `super-quick.ts`; this modal shows its state (the dot loader while it redirects) and the buttons of the other actions.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import checkUrl from '@/views/onboarding/assets/Check.svg'
  import failedUrl from '@/views/onboarding/assets/Failed.svg'
  import partialLogoUrl from '@/views/onboarding/assets/LogoPartialWhite.svg'
  import { type InstalledInstancePayload, narrowInstalledInstance } from '@/views/onboarding/installation-events'
  import { displaysButtons, hasExternalWordPressBuilder, redirectsToWpAdmin } from '@/views/onboarding/super-quick'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import ProgressScreen from '@/views/onboarding/ui/ProgressScreen.vue'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import { cdnDnsPending } from '@/entities/project/instance-resource'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DotLoader from '@/shared/ui/loader/DotLoader.vue'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'
  import ProgressCard from '@/shared/ui/progress-card/ProgressCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    completed?: boolean
    error?: boolean
    /** The installed project (the wrapper passes `newInstance`). */
    installedInstance?: Record<string, unknown> | null
    installedInstanceDnsMismatch?: boolean
    /** The service (the wrapper passes the selected service): the buttons and the redirect wording read it. */
    service?: OnboardingService | null
    showStartCreatingButton?: boolean
  }>(), {
    completed: false,
    error: false,
    installedInstance: null,
    installedInstanceDnsMismatch: false,
    service: null,
    showStartCreatingButton: false,
  })

  const emit = defineEmits<{
    'go-to-dashboard': []
    'go-to-details': [id: number | string]
    'try-again': []
  }>()

  const { t } = useTranslation()
  const { mdAndDown } = useDisplay()
  const themeStore = useThemeStore()

  const installed = computed<InstalledInstancePayload | null>(() => narrowInstalledInstance(props.installedInstance))
  const cdnPending = computed(() => installed.value ? cdnDnsPending(installed.value) : false)
  const redirecting = computed(() => redirectsToWpAdmin(props.service ?? undefined))
  const showButtons = computed(() => displaysButtons(props.service ?? undefined))

  /** "Start Creating": the page of the installed project (as "Site Details" of the standard progress card). */
  function startCreating (): void {
    if (installed.value) {
      emit('go-to-details', installed.value.id)
    }
  }

  /** Bar status of the progress card (kit `ProgressCard`): working until the install completes, then success or failed. */
  const progressStatus = computed<'in-progress' | 'success' | 'failed'>(() => {
    if (!props.completed) {
      return 'in-progress'
    }
    return props.error ? 'failed' : 'success'
  })

  const infoText = computed(() => {
    if (!props.completed) {
      return hasExternalWordPressBuilder(installed.value)
        ? t('heading.onboarding.installation.info.builderInProgress')
        : t('heading.onboarding.installation.info.inProgress')
    }
    if (props.error) {
      return ''
    }
    return redirecting.value
      ? t('heading.onboarding.installation.info.redirecting')
      : t('heading.onboarding.installation.info.completed')
  })

</script>

<style lang="scss" scoped>
  .installation-card {
    // Legacy inline `color: #000; text-align: left` on the DNS options.
    .installation-card__dns {
      color: var(--v-black-base);
      text-align: left;
    }
  }
</style>
