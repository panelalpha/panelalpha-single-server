<template>
  <v-card
    class="mb-8"
    data-testid="summary-instances-card"
    elevation="4"
  >
    <v-card-title class="pb-6 d-flex align-center justify-space-between">
      <h6 class="d-flex align-center">
        {{ t('heading.hosting.summary.instancesCard.title') }}
      </h6>

      <v-chip
        v-if="service.owned && usedInstances !== null"
        class="custom-info-label text-info"
        data-testid="summary-instances-chip"
        label
      >
        <span v-if="hasInstanceLimit">
          {{
            t('heading.hosting.summary.instancesCard.usage.usedOfLimit', {
              used: usedInstances,
              limit: limitInstancesText,
            })
          }}
        </span>

        <span v-else>
          {{
            t('heading.hosting.summary.instancesCard.usage.used', {
              used: usedInstances,
            })
          }}
        </span>
      </v-chip>
    </v-card-title>

    <v-divider />

    <v-card-text class="d-flex flex-column pt-2 px-0">
      <template v-if="!loading">
        <template v-if="instances.length > 0">
          <router-link
            v-for="(item, index) in instances"
            :key="`${item.id}-${index}`"
            class="d-flex py-2 instance px-6"
            data-testid="summary-instance-row"
            :to="resourcePath(item.id)"
          >
            <router-link :to="resourcePath(item.id)">
              <InstanceAvatar
                :documentation-link="documentationLink"
                :instance="item"
                :single-server="singleServer"
                :size="40"
              />
            </router-link>

            <div class="d-flex flex-column ml-4 instance__title">
              <h6 class="d-flex align-center">
                {{ item.title }}
                <SuspendChip
                  v-if="item.service_status === 'suspended' || item.service_status === 'cancelled'"
                  class="ml-2"
                  with-tooltip
                />
              </h6>

              <a
                class="instance__link"
                :href="item.url"
                @click.stop
              >{{ item.url }}</a>
            </div>

            <div class="d-flex ml-auto">
              <!-- Legacy `mr-2` landed on the root of the `ShareInstanceModal` that wrapped the label, not on the chip. -->
              <div class="d-flex mr-2">
                <SharesLabel
                  :instance="item"
                  @open="openShare(item)"
                />
              </div>

              <StatusIndicator
                :key="item.id"
                :ref="element => setIndicator(item.id, element)"
                :instance="item"
                :same-size="true"
                :submitting="resolver.isSubmitting(item.id)"
                @error="resolver.onError"
                @resolve="payload => resolver.onResolve(item.id, payload, indicators[String(item.id)])"
              />
            </div>
          </router-link>
        </template>

        <template v-else>
          <EmptyState
            data-testid="summary-instances-empty"
            :desc="t('message.emptyTable.projects.subtitle', { defaultValue: 'No projects yet. Create one to get started.' })"
            :title="t('message.emptyTable.instances.title')"
            title-tag="h5"
            variant="card"
          >
            <template #image>
              <HostingInstancesCardIllustration />
            </template>

            <template #action>
              <PageAddButton
                data-testid="summary-instances-add"
                :label="t('button.addNew')"
                @click="startInstallation"
              />
            </template>
          </EmptyState>
        </template>
      </template>

      <template v-else>
        <div
          v-for="item in 5"
          :key="item"
          class="d-flex py-2 px-6"
        >
          <v-skeleton-loader
            class="my-1"
            type="avatar"
          />

          <div class="d-flex flex-column ml-4">
            <v-skeleton-loader
              class="mb-1"
              height="16"
              type="text"
              width="140"
            />

            <v-skeleton-loader
              height="14"
              type="text"
              width="80"
            />
          </div>
        </div>
      </template>
    </v-card-text>

    <v-divider />

    <div v-if="instances.length > 0 && instances.length !== totalInstances && totalInstances > 5">
      <AppButton
        block
        class="load-more-btn"
        data-testid="summary-load-more"
        kind="text"
        :loading="loadingServices"
        size="x-large"
        @click="reloadInstances(99)"
      >
        <span class="p-4 font-weight-regular">{{ t('button.loadMore') }}</span>
      </AppButton>
    </div>

    <!-- Legacy `SharesLabel` wrapped its own `ShareInstanceModal`; the kit label only reports the click (as on the instance list). -->
    <ShareInstanceModal
      v-model="shareOpen"
      :current-user-email="session.user?.email"
      :instance="shareInstance"
      :single-server="isSingleServer(session.home)"
    />
  </v-card>
</template>

<script lang="ts" setup>
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { DomainInstance } from './nameserver-records'
  // App and app-lite differ only in the row link.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { listHostingInstances, toHostingInstance } from '@/views/hosting/hosting.api'
  import InstanceAvatar from '@/entities/project/ui/InstanceAvatar.vue'
  import ShareInstanceModal from '@/entities/project/ui/ShareInstanceModal.vue'
  import SharesLabel from '@/entities/project/ui/SharesLabel.vue'
  import StatusIndicator from '@/entities/project/ui/status-issues/StatusIndicator.vue'
  import SuspendChip from '@/entities/project/ui/SuspendChip.vue'
  import { type IssueIndicator, useIssueResolve } from '@/entities/project/use-issue-resolve'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { isSingleServer } from '@/shared/session/home-access'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import HostingInstancesCardIllustration from '@/shared/ui/illustrations/HostingInstancesCardIllustration.vue'

  const props = defineProps<{
    service: HostingService
  }>()

  const emit = defineEmits<{
    'instances-loading': [loading: boolean]
    'instances-loaded': [instances: DomainInstance[]]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const singleServer = computed(() => isSingleServer(session.home))
  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))

  const loading = ref(true)
  const instances = ref<InstanceResource[]>([])
  const totalInstances = ref(0)
  // Legacy quirk kept: this flag is set only while the empty state's "Add new" refreshes the services, yet it is the `loading` of "Load more".
  const loadingServices = ref(false)

  const resolver = useIssueResolve()
  const indicators: Record<string, IssueIndicator | undefined> = {}

  function setIndicator (id: number | string, element: unknown): void {
    indicators[String(id)] = (element ?? undefined) as IssueIndicator | undefined
  }

  const shareOpen = ref(false)
  const shareInstance = ref<InstanceResource | undefined>(undefined)

  function openShare (instance: InstanceResource): void {
    shareInstance.value = instance
    shareOpen.value = true
  }

  /** `/instances/<id>`, or `/projects/<id>` on a single-server install (app-lite). */
  function resourcePath (id: number | string): string {
    return `${preferredSpaBase(session.home)}/${id}`
  }

  const usedInstances = computed(() => props.service.instances_count ?? null)
  const limitInstances = computed(() => props.service.plan_settings?.instance_limit)
  const hasInstanceLimit = computed(() => limitInstances.value !== null && limitInstances.value !== undefined)
  const limitInstancesText = computed(() => hasInstanceLimit.value ? String(limitInstances.value) : '∞')

  /** One request per server account, merged; an account that fails is skipped, the totals add up. */
  async function reloadInstances (perPage: 5 | 99 = 5): Promise<void> {
    loading.value = true

    const results = await Promise.all(props.service.server_accounts.map(async account => {
      try {
        return await listHostingInstances(account.id, perPage)
      } catch {
        return null
      }
    }))

    instances.value = []
    totalInstances.value = 0
    for (const result of results) {
      if (result === null) {
        continue
      }
      instances.value.push(...result.data.map(item => toHostingInstance(item, session.home)))
      totalInstances.value += result.meta.total
    }
    emit('instances-loaded', instances.value as DomainInstance[])
    loading.value = false
  }

  watch(() => props.service, () => {
    loading.value = true
    void nextTick(() => reloadInstances())
  })

  // The parent starts the DNS verification when this turns false.
  watch(loading, value => emit('instances-loading', value))

  onMounted(() => reloadInstances())

  /** Legacy refreshes the services, then asks the root to start the installation. */
  async function startInstallation (): Promise<void> {
    loadingServices.value = true
    try {
      await session.refreshServices()
    } catch {
      return
    } finally {
      loadingServices.value = false
    }
    emitAppEvent('start-installation-process')
  }

  defineExpose({ reloadInstances, totalInstances })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;
@use './skeleton' as *;

.v-card-title.pb-6 {
  // V2 `.v-card__title` wraps its children (the chip drops below the title on a narrow screen); V4's is a nowrap row.
  flex-wrap: wrap;
}

a {
  color: var(--v-gray-darken1);
}

.v-skeleton-loader {
  @include summary-skeleton;

  // V4 pins the avatar bone with min/max sizes as well; V2's 40px avatar has no bottom margin here (loader 40px high).
  :deep(.v-skeleton-loader__avatar) {
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    max-width: 40px;
    margin: 0;
  }
}

.load-more-btn {
  background: transparent;

  // V2 `&:before { background: transparent !important }`: the state layer of V4
  :deep(.v-btn__overlay) {
    background: transparent !important;
  }

  :deep(.v-btn__content > span) {
    transition: color 0.24s ease;
  }

  &:hover :deep(.v-btn__content > span) {
    color: var(--v-primary-base) !important;
  }
}

// V2 `.v-btn.v-size--x-large`
.v-btn.v-btn--size-x-large {
  height: 50px;
  font-size: v.$font-size-xs;
  line-height: v.$line-height-xs;
  font-weight: v.$font-weight-normal;
}

.instance {
  transition: background-color 0.3s ease;
  max-width: 100%;

  &__title {
    max-width: calc(100% - 80px);
  }

  h6 {
    max-width: 100%;
    text-overflow: ellipsis;
  }

  &:hover {
    background-color: var(--v-primary-lighten4);
  }

  &__title,
  &__link {
    transition: color 0.3s ease;
  }

  &__title:hover {
    color: var(--v-primary-darken1);
  }

  &__link:hover {
    color: var(--v-info-base);
  }
}

.v-chip.custom-info-label {
  height: 24px;
  padding: 4px 12px;
  // V2 `.v-chip--label` is `border-radius: 4px !important`, which beats the 100px of the legacy rule; V4 adds a border.
  border-radius: 4px !important;
  border-style: none;
  // Theme token: light rgba(0, 0, 0, 0.12), dark hsla(0, 0%, 100%, 0.12).
  border-color: var(--v-chip-outlined-border);
  display: flex;
  align-items: center;
  white-space: nowrap;
  font-size: v.$font-size-sm;
  line-height: 21px;
  font-weight: 700;
  // Hard-coded in legacy (also in dark): fixed token `--v-custom-info-label-bg`, same value in both themes.
  background: var(--v-custom-info-label-bg) !important;
  background-color: var(--v-custom-info-label-bg) !important;

  .v-icon {
    cursor: pointer;
  }
}
</style>
