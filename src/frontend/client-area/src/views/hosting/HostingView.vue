<template>
  <page-frame
    :body-testid="serverUsageOnly ? 'hosting-server-usage-only' : undefined"
    highlight-rows
    :sidebar-empty="singleServer && !showSidebar"
    testid-prefix="hosting"
    :title="singleServer ? t('heading.navbar.tab.myServer') : t('heading.navbar.tab.myHosting')"
  >
    <!-- The sidebar slot stays while the frame body shows, also when the sidebar is empty (single-server without DNS or e-mail), so the
         routed page is not remounted when the sidebar arrives. -->
    <template
      v-if="showFrameBody"
      #sidebar
    >
      <HostingPagesSidebar
        v-if="showSidebar && hosting.selectedService"
        :active-service="hosting.selectedService"
        :services="hosting.services"
        @update:active-service="changeService"
      />
    </template>

    <template
      v-if="adminServerUrl && route.path === USAGE_PATH"
      #filters
    >
      <AppButton
        class="p-2 font-weight-bold ml-auto"
        data-testid="usage-admin-button"
        :href="adminServerUrl"
        kind="primary"
        rel="noopener noreferrer"
        size="large"
        target="_blank"
      >
        <v-icon
          class="text-white"
          icon="$externallink"
          size="22"
        />
        {{ ` ${t('button.fullServerManagement')}` }}
      </AppButton>
    </template>

    <template
      v-if="!showFrameBody && hosting.suspendedService"
      #empty
    >
      <NoAvailableHostingView :suspended-service="hosting.suspendedService" />
    </template>

    <!-- One router-view, so Usage shown while GET /services runs is not remounted when the service arrives. Single-server
         without a service (or before the list is in) renders only Usage, which needs no service. -->
    <router-view
      v-if="servicePageRedirect === null && ((hosting.selectedService && !hosting.loadingServices) || ((serverUsageOnly || usageWhileLoading) && route.path === USAGE_PATH))"
      :service="hosting.selectedService ?? undefined"
    />
  </page-frame>
</template>

<script lang="ts" setup>
  import type { HostingService } from './hosting.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, watch } from 'vue'
  import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
  import { hasHostingAccess, isSingleServer, isUserSingleServerAdmin } from '@/shared/session/home-access'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import { hiddenHostingPageRedirect, isServiceServerPage, needsSummaryRedirect, needsUsageRedirect, resolveRequestedService } from './hosting-service'
  import { serviceServerItems } from './hosting-sidebar-items'
  import { readSelectedPlanId, useHostingStore } from './hosting.store'
  import HostingPagesSidebar from './HostingPagesSidebar.vue'
  import NoAvailableHostingView from './NoAvailableHostingView.vue'

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()
  const hosting = useHostingStore()

  const singleServer = computed(() => isSingleServer(session.home))

  const USAGE_PATH = '/hosting/usage'
  const serverUsageOnly = computed(() => singleServer.value && !hosting.loadingServices && !hosting.servicesFailed && !hosting.selectedService && !hosting.suspendedService)
  // Single-server Usage needs no service, so it renders (with its own skeletons) while GET /services
  // runs; legacy shows nothing below the title until the list is in.
  const usageWhileLoading = computed(() => singleServer.value && hosting.loadingServices && route.path === USAGE_PATH)
  // The frame body with the sidebar: a selected service, or single-server Usage without one (also while GET /services runs).
  const showFrameBody = computed(() => Boolean(hosting.selectedService) || serverUsageOnly.value || usageWhileLoading.value)
  // The sidebar: multi-server shows it for every selected service. Single-server shows it only when the service gives DNS or e-mail
  // items, or when the user has 2 or more services (the plan selector lives in the sidebar), and never while GET /services runs.
  const showSidebar = computed(() => {
    const service = hosting.selectedService
    if (!service || hosting.loadingServices) {
      return false
    }
    return !singleServer.value
      || serviceServerItems(service, { emailRecordsDot: false }).length > 0
      || hosting.services.length > 1
  })
  // The admin button sits in the frame head, on Usage only.
  const adminServerUrl = computed(() => {
    const appUrl = session.home?.admin?.app_url
    return isUserSingleServerAdmin(session.home) && appUrl ? `${appUrl}/server` : null
  })
  // Every other page needs a service: without one, single-server lands on Usage.
  watch([serverUsageOnly, () => route.path], ([usageOnly, path]) => {
    if (usageOnly && path !== USAGE_PATH) {
      void router.replace(USAGE_PATH)
    }
  })

  function changeService (service: HostingService): void {
    hosting.changeService(service)
    // Single-server keeps Usage and Summary, the service server pages (DNS, e-mail) stay
    // behind their own checks (`needsSummaryRedirect`), any other page goes to Usage. Single-server has no Summary in its sidebar.
    if (singleServer.value) {
      if (!needsUsageRedirect(route.path)) {
        return
      }
      if (!isServiceServerPage(route.path) || needsSummaryRedirect(route.path, service)) {
        void router.push('/hosting/usage')
      }
      return
    }
    if (needsSummaryRedirect(route.path, service)) {
      void router.push('/hosting/summary')
    }
  }

  // A page the sidebar does not offer must not mount on a direct visit: single-server's sidebar lists Usage and the server pages the
  // service offers (DNS, e-mail), so any other section goes to Usage; multi-server keeps the service's privilege rule. This is the rule
  // `changeService` applies when the plan changes; every other page keeps its own entry rule
  // (`/hosting/containers` stays reachable by direct URL).
  const servicePageRedirect = computed<string | null>(() => {
    const service = hosting.selectedService
    if (!service) {
      return null
    }

    return hiddenHostingPageRedirect(route.path, service, singleServer.value)
  })

  watch(servicePageRedirect, target => {
    if (target !== null) {
      void router.replace(target)
    }
  }, { immediate: true })

  /** Reads `?id=` and removes it from the query. */
  function takeQueryServiceId (): string | null {
    const id = route.query.id
    if (!id) {
      return null
    }
    const { id: _removed, ...query } = route.query
    void router.replace({ query })
    return String(id)
  }

  onMounted(() => {
    if (!hasHostingAccess(session.home)) {
      void router.push({ name: 'instances' })
      return
    }

    const state = history.state as { instance?: { service_id?: string | number } } | null
    const fromParams = state?.instance?.service_id ?? null
    const { id, consumeQuery } = resolveRequestedService({
      fromParams,
      fromSession: readSelectedPlanId(),
      fromQuery: typeof route.query.id === 'string' ? route.query.id : null,
    })
    if (consumeQuery) {
      takeQueryServiceId()
    }
    void hosting.loadServices(id)
  })

  onBeforeRouteLeave(() => {
    hosting.clearSelection()
  })
</script>
