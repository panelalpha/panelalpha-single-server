<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project` uses the global `.page-title--advanced` frame. -->
    <PageTitle
      :title="t('heading.hosting.containers.title')"
      title-testid="containers-title"
      :variant="isProject ? 'advanced' : 'section'"
    >
      <!-- No Refresh button: the list reloads by itself every `POLL_INTERVAL_MS`. -->
      <template #filters>
        <!-- `project`: the Actions menu; disabled without containers and while an action runs. -->
        <quick-actions-button
          v-if="isProject"
          :actions="menuActions"
          :disabled="!hasProjectContainers || isActing()"
          :icon="false"
          :label="t('button.actions')"
          :loading="isActing()"
          mobile-icon="settings"
          test-id="containers-actions"
          @select="onProjectActionSelect"
        />
      </template>
    </PageTitle>

    <v-container :class="isProject ? 'mt-3 px-0 pt-4' : 'mt-3 px-0'">
      <!-- `hosting` keeps the full-page spinner; `project` shows the table skeleton instead (below). -->
      <div
        v-if="!isProject && loading && groups.length === 0"
        class="text-center py-12"
      >
        <v-progress-circular indeterminate />
      </div>

      <!-- `project` renders the one group of the project (`tableGroups`); the card and table below are shared by both variants. -->
      <div
        v-for="group in tableGroups"
        :key="group.account.id"
        :class="isProject ? undefined : 'mb-6'"
        :data-testid="isProject ? undefined : 'containers-group'"
      >
        <!-- Per-group header with project actions (`hosting` only; the `project` actions are in the title). -->
        <v-row
          v-if="!isProject"
          class="align-center mb-2 px-1"
        >
          <v-col class="d-flex align-center py-1">
            <span
              class="text-subtitle-1 font-weight-medium containers-group-title"
              data-testid="containers-group-title"
            >
              {{ group.account.domain || group.account.username }}
            </span>
          </v-col>

          <v-col class="d-flex justify-end py-1">
            <v-tooltip
              location="bottom"
              :offset="4"
              open-delay="150"
              transition="custom-tooltip"
              :z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <AppButton
                  v-bind="activatorProps"
                  :aria-label="t('heading.hosting.containers.action.up')"
                  class="mr-1 containers-group-btn"
                  :disabled="!!actionLoading[group.account.id] || group.containers.length === 0"
                  elevation="0"
                  :loading="actionLoading[group.account.id] === 'up'"
                  size="small"
                  @click="doProjectAction(group, 'up')"
                >
                  <v-icon
                    :class="mobile ? 'mr-0' : 'mr-1'"
                    icon="$play"
                    size="small"
                  />
                  {{ mobile ? '' : t('heading.hosting.containers.action.up') }}
                </AppButton>
              </template>

              <span>{{ t('heading.hosting.containers.action.up') }}</span>
            </v-tooltip>

            <v-tooltip
              location="bottom"
              :offset="4"
              open-delay="150"
              transition="custom-tooltip"
              :z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <AppButton
                  v-bind="activatorProps"
                  :aria-label="t('heading.hosting.containers.action.restart')"
                  class="mr-1 containers-group-btn"
                  :disabled="!!actionLoading[group.account.id] || group.containers.length === 0"
                  elevation="0"
                  :loading="actionLoading[group.account.id] === 'restart'"
                  size="small"
                  @click="confirmProjectAction(group, 'restart')"
                >
                  <v-icon
                    :class="mobile ? 'mr-0' : 'mr-1'"
                    icon="$restore"
                    size="small"
                  />
                  {{ mobile ? '' : t('heading.hosting.containers.action.restart') }}
                </AppButton>
              </template>

              <span>{{ t('heading.hosting.containers.action.restart') }}</span>
            </v-tooltip>

            <v-tooltip
              location="bottom"
              :offset="4"
              open-delay="150"
              transition="custom-tooltip"
              :z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <AppButton
                  v-bind="activatorProps"
                  :aria-label="t('heading.hosting.containers.action.stop')"
                  class="mr-1 containers-group-btn"
                  :disabled="!!actionLoading[group.account.id] || group.containers.length === 0"
                  elevation="0"
                  :loading="actionLoading[group.account.id] === 'stop'"
                  size="small"
                  @click="confirmProjectAction(group, 'stop')"
                >
                  <v-icon
                    :class="mobile ? 'mr-0' : 'mr-1'"
                    icon="$pauseLine"
                    size="small"
                  />
                  {{ mobile ? '' : t('heading.hosting.containers.action.stop') }}
                </AppButton>
              </template>

              <span>{{ t('heading.hosting.containers.action.stop') }}</span>
            </v-tooltip>

            <!-- No Down button. -->
            <v-tooltip
              location="bottom"
              :offset="4"
              open-delay="150"
              transition="custom-tooltip"
              :z-index="99"
            >
              <template #activator="{ props: activatorProps }">
                <AppButton
                  v-bind="activatorProps"
                  :aria-label="t('heading.hosting.containers.action.pull')"
                  :disabled="!!actionLoading[group.account.id] || group.containers.length === 0"
                  kind="secondary"
                  :loading="actionLoading[group.account.id] === 'pull'"
                  size="small"
                  @click="confirmProjectAction(group, 'pull')"
                >
                  <v-icon
                    :class="mobile ? 'mr-0' : 'mr-1'"
                    icon="$downloadLine"
                    size="small"
                  />
                  {{ mobile ? '' : t('heading.hosting.containers.action.pull') }}
                </AppButton>
              </template>

              <span>{{ t('heading.hosting.containers.action.pull') }}</span>
            </v-tooltip>
          </v-col>
        </v-row>

        <!-- Container table: the one `DataTable` of the app; the `project` card has a test id. -->
        <DataTable
          :actions-sort="false"
          :data-testid="isProject ? 'containers-card' : undefined"
          :headers="tableHeaders"
          hide-footer
          :item-slots="['Image', 'State', 'Status', 'ports']"
          :items="group.containers"
          :items-per-page="-1"
          :sort-by="sortOf(group).by"
          :sort-desc="sortOf(group).desc"
          table-testid="containers-table"
          @update:sort-by="setSort(group, { by: $event })"
          @update:sort-desc="setSort(group, { desc: $event })"
        >
          <!-- A long image name is cut with an ellipsis; the full name is in the tooltip. -->
          <template #item.Image="{ item }">
            <span
              class="containers-image"
              :title="asContainer(item).Image"
            >{{ asContainer(item).Image }}</span>
          </template>

          <template #item.State="{ item }">
            <StatusLabel
              :status="stateColor(asContainer(item).State)"
              :value="asContainer(item).State"
            />
          </template>

          <!-- Uptime from the Docker status (`Up 59 seconds` → `59 seconds`); the full status is in the tooltip. -->
          <template #item.Status="{ item }">
            <span
              class="containers-uptime"
              :title="asContainer(item).Status"
            >{{ containerUptime(asContainer(item).Status) }}</span>
          </template>

          <template #item.ports="{ item }">
            <ContainerPorts
              :container="asContainer(item)"
              :proxy-rules="proxyRules"
              :server-ip="serverIp"
            />
          </template>

          <!-- One Start/Stop button by the state, Restart, Public URLs and Logs; the loader is in the button of the running action. -->
          <template #actions="container">
            <AppButton
              :aria-label="toggleLabel(asContainer(container).State)"
              :disabled="rowBusy(group, asContainer(container)) && !rowActing(group, asContainer(container), toggleAction(asContainer(container).State))"
              kind="row-action"
              :loading="rowActing(group, asContainer(container), toggleAction(asContainer(container).State))"
              :tooltip="toggleLabel(asContainer(container).State)"
              :tooltip-offset="4"
              @click="requestServiceAction(group, asContainer(container).Service, toggleAction(asContainer(container).State))"
            >
              <v-icon :icon="canStop(asContainer(container).State) ? '$pauseLine' : '$play'" />
            </AppButton>

            <AppButton
              :aria-label="t('heading.hosting.containers.service.restart')"
              :disabled="(rowBusy(group, asContainer(container)) && !rowActing(group, asContainer(container), 'restart')) || !canStop(asContainer(container).State)"
              kind="row-action"
              :loading="rowActing(group, asContainer(container), 'restart')"
              :tooltip="t('heading.hosting.containers.service.restart')"
              :tooltip-offset="4"
              @click="requestServiceAction(group, asContainer(container).Service, 'restart')"
            >
              <v-icon icon="$restore" />
            </AppButton>

            <AppButton
              v-if="canManageUrls"
              :aria-label="copy.publicUrls"
              data-testid="containers-public-urls"
              :disabled="rowBusy(group, asContainer(container)) || parseHostPorts(asContainer(container).Ports).length === 0"
              kind="row-action"
              :tooltip="copy.publicUrls"
              :tooltip-offset="4"
              @click="openManageUrls(group, asContainer(container))"
            >
              <v-icon icon="$globe" />
            </AppButton>

            <AppButton
              :aria-label="t('heading.hosting.containers.logs.title')"
              :disabled="rowBusy(group, asContainer(container))"
              kind="row-action"
              :tooltip="t('heading.hosting.containers.logs.title')"
              :tooltip-offset="4"
              @click="openLogs(group, asContainer(container).Service)"
            >
              <v-icon icon="$filetext" />
            </AppButton>
          </template>

          <template #mobile="{ item, headers: columns }">
            <MobileTableField
              :label="columnTitles[0]"
              :value="asContainer(item).Service"
              @sort="clickSort(group, columns[0]!)"
            />

            <MobileTableField
              :label="columnTitles[1]"
              @sort="clickSort(group, columns[1]!)"
            >
              <span
                class="containers-image"
                :title="asContainer(item).Image"
              >{{ asContainer(item).Image }}</span>
            </MobileTableField>

            <MobileTableField :label="columnTitles[2]">
              <StatusLabel
                :status="stateColor(asContainer(item).State)"
                :value="asContainer(item).State"
              />
            </MobileTableField>

            <MobileTableField
              :label="columnTitles[3]"
              :value="containerUptime(asContainer(item).Status)"
            />

            <MobileTableField :label="columnTitles[4]">
              <ContainerPorts
                :container="asContainer(item)"
                :proxy-rules="proxyRules"
                :server-ip="serverIp"
              />
            </MobileTableField>
          </template>

          <template #no-data>
            <ContainersEmpty />
          </template>
        </DataTable>
      </div>

      <!-- `hosting` after a load without any project with containers: the same empty table as `project` (before, an empty page under the title). -->
      <DataTable
        v-if="!isProject && loaded && groups.length === 0"
        data-testid="containers-card"
        :headers="tableHeaders"
        hide-footer
        :items="[]"
        :items-per-page="-1"
        table-testid="containers-table"
      >
        <template #no-data>
          <ContainersEmpty />
        </template>
      </DataTable>

      <!-- `project` without its group (`groups` has no match, or the first load is pending): the empty table with the no-data text, or the skeleton. -->
      <DataTable
        v-if="isProject && !projectGroup"
        data-testid="containers-card"
        :headers="tableHeaders"
        hide-footer
        :items="[]"
        :items-loading="showSkeleton"
        :items-per-page="-1"
        table-testid="containers-table"
      >
        <template #no-data>
          <ContainersEmpty />
        </template>
      </DataTable>
    </v-container>

    <!-- Danger dialog of an action that stops or recreates containers: Restart, Stop All and Pull &
         Redeploy of the project, Stop and Restart of one container, and the removal of a public URL (over the URLs dialog). No checkbox;
         the action runs after the click, with the loader in its own button. -->
    <AppDialog
      v-model="actionConfirm.open"
      overlay
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <basic-modal
        :buttons="confirmButtons"
        class="card-width-560"
        color="error"
        data-testid="containers-confirm"
        icon="$alertwarning"
        :message="confirmText.message"
        :title="confirmText.title"
        @button-click="onConfirmButton"
        @modal-close="actionConfirm.open = false"
      />
    </AppDialog>

    <AppDialog
      v-model="logsModal.open"
      overlay
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <!-- Only the X in the corner; Refresh (with its loader) and Close are the footer buttons of the kit modal. -->
      <basic-modal
        :buttons="logsButtons"
        class="card-width-860"
        :loading="logsModal.loading"
        :title="logsTitle"
        @button-click="onLogsButton"
        @modal-close="logsModal.open = false"
      >
        <template #custom>
          <div class="logs-dialog-body">
            <!-- Loading: the lines of a log as a skeleton, not a spinner in the middle. -->
            <log-lines-skeleton
              v-if="logsModal.loading"
              data-testid="containers-logs-skeleton"
            />

            <pre
              v-else
              class="logs-pre"
            >{{ logsModal.content || t('heading.hosting.containers.logs.empty') }}</pre>
          </div>
        </template>
      </basic-modal>
    </AppDialog>

    <AppDialog
      v-model="urlsDialog.open"
      overlay
      :persistent="urlsBusy"
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <basic-modal
        :buttons="urlsButtons"
        class="card-width-560"
        :loading="urlsDialog.saving"
        :title="urlsTitle"
        @button-click="onUrlsButton"
        @modal-close="urlsDialog.open = false"
      >
        <template #custom>
          <div class="urls-dialog-body">
            <!-- A container with several public ports: the port whose URLs the dialog shows and adds. -->
            <v-select
              v-if="urlsDialog.hostPorts.length > 1"
              class="mb-4"
              density="compact"
              hide-details
              :items="urlsDialog.hostPorts"
              :label="copy.portLabel"
              :model-value="urlsDialog.upstreamPort"
              variant="outlined"
              @update:model-value="selectUrlsPort($event)"
            />

            <div
              v-if="urlsDialog.rulesForContainer.length > 0"
              class="mb-4"
            >
              <v-list density="compact">
                <v-list-item
                  v-for="rule in urlsDialog.rulesForContainer"
                  :key="rule.id"
                  class="px-0 urls-rule"
                >
                  <v-list-item-title>
                    <a
                      class="urls-rule-link"
                      :href="buildUrlFromRule(rule, serverIp)"
                      rel="noopener noreferrer"
                      target="_blank"
                    >{{ buildUrlFromRule(rule, serverIp) }}</a>
                  </v-list-item-title>

                  <v-list-item-subtitle class="urls-rule-sub">
                    {{ copy.listenPortLabel(rule.listen_port) }}
                    <span v-if="rule.server_name">{{ copy.serverNameLabel(rule.server_name) }}</span>
                  </v-list-item-subtitle>

                  <template #append>
                    <AppButton
                      :aria-label="t('button.remove')"
                      class="urls-rule-remove"
                      kind="icon"
                      :loading="urlsDialog.deletingId === rule.id"
                      size="small"
                      @click="confirmRemoveUrl(rule)"
                    >
                      <v-icon
                        color="error"
                        icon="$trash"
                        size="small"
                      />
                    </AppButton>
                  </template>
                </v-list-item>
              </v-list>

              <v-divider class="mb-4" />
            </div>

            <div
              v-else
              class="text-gray mb-4 text-center py-2"
            >
              {{ copy.noPublicUrls }}
            </div>

            <!-- Add new URL form: domain + listen port (domain required, no IP listen) -->
            <p class="text-subtitle-2 mb-2">
              {{ copy.addPublicUrl }}
            </p>

            <div
              v-if="!urlsDialog.domainsLoading && urlsDialog.domainOptions.length === 0"
              class="text-caption text-error mb-2"
            >
              {{ copy.noDomain }}
            </div>

            <div class="d-flex align-center urls-form-row">
              <v-select
                v-model="urlsDialog.newDomain"
                class="urls-domain-select"
                density="compact"
                :disabled="urlsDialog.domainOptions.length === 0"
                hide-details
                item-title="label"
                item-value="value"
                :items="urlsDialog.domainOptions"
                :label="copy.domainLabel"
                :loading="urlsDialog.domainsLoading"
                variant="outlined"
              />

              <span class="text-grey-darken-1 text-body-2">{{ copy.portSeparator }}</span>

              <v-text-field
                v-model="urlsDialog.newListenPort"
                :aria-label="copy.portLabel"
                class="urls-port-field"
                density="compact"
                hide-details
                type="number"
                variant="outlined"
              />
            </div>

            <div class="caption containers-hint mt-1 ml-1">
              {{ copy.arrow }} {{ urlPreview }}
            </div>
          </div>
        </template>
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { ConfirmedAction } from './containers'
  import type { Container, ContainerGroup, ProxyRule } from './containers.api'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { DataTableHeader } from '@/shared/ui/data-table/data-table'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { hasPrivilege, HOSTING_PRIVILEGES } from '@/views/hosting/hosting-privileges'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { isPageHidden } from '@/shared/browser/page-visibility'
  import { escapeHtml } from '@/shared/format/escape-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import QuickActionsButton from '@/shared/ui/buttons/QuickActionsButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import LogLinesSkeleton from '@/shared/ui/skeletons/LogLinesSkeleton.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import ContainerPorts from './ContainerPorts.vue'
  import { buildUrlFromRule, canStop, confirmCopy, confirmedProjectAction, confirmedServiceAction, containerHeaders, CONTAINERS_COPY, containerUptime, isGroupActing, parseHostPorts, previewPublicUrl, projectActions, serviceKey, stateColor } from './containers'
  import { scopeGroups, scopeRules } from './containers-scope'
  import { containerLogs, createProxyRule, deleteProxyRule, listContainerGroups, listDomains, listProxyRules, projectAction, serviceAction } from './containers.api'
  import ContainersEmpty from './ContainersEmpty.vue'

  const props = withDefaults(defineProps<{
    service: HostingService
    variant?: 'hosting' | 'project'
    /** `project` only: the server IP from the instance. */
    serverIp?: string | null
  }>(), {
    variant: 'hosting',
    serverIp: undefined,
  })

  const isProject = computed(() => props.variant === 'project')

  const { t } = useTranslation()
  const { mobile } = useDisplay()
  const alerts = useAlertsStore()

  const loading = ref(false)
  const groups = ref<ContainerGroup[]>([])
  // A list has come back at least once: the `hosting` empty table waits for it, so it does not flash before the first GET.
  const loaded = ref(false)
  // `project` shows the one group of the project; `hosting` shows every account.
  const projectGroup = computed<ContainerGroup | null>(() => groups.value[0] ?? null)
  // The Actions menu above the `project` table is disabled while the project has no container.
  const hasProjectContainers = computed(() => (projectGroup.value?.containers.length ?? 0) > 0)
  // `project` skeleton on the first load only, so a reload or a poll with groups on screen keeps the rows.
  const showSkeleton = computed(() => isProject.value && loading.value && groups.value.length === 0)
  const tableGroups = computed<ContainerGroup[]>(() => {
    if (!isProject.value) {
      return groups.value
    }
    return projectGroup.value ? [projectGroup.value] : []
  })
  const proxyRules = ref<ProxyRule[]>([])
  // Keyed by account id (project actions) and by `serviceKey` (container actions). Filled by the action handlers.
  const actionLoading = ref<Record<number, string | undefined>>({})
  // The running action of a container (`start`, `stop`, `restart`): its button shows the loader, the other buttons of the row are disabled.
  const serviceLoading = ref<Record<string, string | undefined>>({})
  // The danger dialog: `target` is the action that runs on Confirm, on the containers of `group`. Both stay set after the dialog
  // closes, so its text does not change during the closing transition.
  const actionConfirm = ref<{ open: boolean, group: ContainerGroup | null, target: ConfirmedAction | null }>({ open: false, group: null, target: null })
  // The Logs dialog. The account and the service are kept so that its refresh asks for the same container.
  const logsModal = ref<{ open: boolean, loading: boolean, accountId: number | null, service: string, content: string }>({
    open: false,
    loading: false,
    accountId: null,
    service: '',
    content: '',
  })
  // The Manage Public URLs dialog. `upstreamPort` is the container port the rules point to.
  const urlsDialog = ref<{
    open: boolean
    saving: boolean
    deletingId: number | null
    group: ContainerGroup | null
    containerService: string
    /** Public host ports of the container; the dialog shows a port select when there is more than one. */
    hostPorts: number[]
    upstreamPort: number | null
    rulesForContainer: ProxyRule[]
    newListenPort: string
    newDomain: string | null
    domainOptions: { label: string, value: string }[]
    domainsLoading: boolean
  }>({
    open: false,
    saving: false,
    deletingId: null,
    group: null,
    containerService: '',
    hostPorts: [],
    upstreamPort: null,
    rulesForContainer: [],
    newListenPort: '',
    newDomain: null,
    domainOptions: [],
    domainsLoading: false,
  })
  // The preview under the form: the https scheme only for port 443, the dash while there is no domain.
  const urlPreview = computed(() => previewPublicUrl(urlsDialog.value.newDomain, Number.parseInt(urlsDialog.value.newListenPort) || 0))
  // A rule is being added or deleted: the dialog is persistent and a second request is not started.
  const urlsBusy = computed(() => urlsDialog.value.saving || urlsDialog.value.deletingId !== null)

  // The rules are asked and the proxied and external
  // chips are clickable only with this privilege.
  const canManageUrls = computed(() => hasPrivilege(props.service, HOSTING_PRIVILEGES.MANAGE_PROXY_ROUTING))
  // The server IP: the first address of the first server account (`hosting`); in `project` it comes from the instance (prop).
  const serverIp = computed(() => isProject.value
    ? (props.serverIp ?? null)
    : (props.service.server_accounts[0]?.ipv4_addresses?.[0] ?? null))
  // `containerHeaders` yields `{ title, key, sortable, align }` columns; the table takes them as sort headers with the title as label.
  const tableHeaders = computed<DataTableHeader[]>(() => containerHeaders(key => t(key)).map(column => ({
    text: column.key.toLowerCase(),
    label: column.title,
    value: column.key,
    sortable: column.sortable,
    align: column.align,
  })))
  const columnTitles = computed(() => tableHeaders.value.map(column => String(column.label ?? '')))
  // The sort of each table (the v-for renders one table per group): a click on a sortable header sorts by it, a second one flips the direction.
  const sorts = reactive<Record<number, { by: LegacySortHeader | false, desc: boolean }>>({})
  // Reading does not write (the template calls it while rendering); the entry of a group is made by its first sort.
  function sortOf (group: ContainerGroup): { by: LegacySortHeader | false, desc: boolean } {
    return sorts[group.account.id] ?? { by: false, desc: false }
  }
  function setSort (group: ContainerGroup, change: Partial<{ by: LegacySortHeader | false, desc: boolean }>): void {
    sorts[group.account.id] = { ...sortOf(group), ...change }
  }
  // The label of a mobile field sorts as the header of the desktop table does.
  function clickSort (group: ContainerGroup, header: LegacySortHeader): void {
    const sort = sortOf(group)
    if (sort.by && sort.by.value === header.value) {
      setSort(group, { desc: !sort.desc })
    } else {
      setSort(group, { by: header })
    }
  }
  const copy = CONTAINERS_COPY
  // The footers and titles of the three dialogs (kit `BasicModal`). The spinner uses `loading`, not `submitting`: Cancel and X stay clickable
  // while a request runs, as before. Labels are computed, so they follow a language change.
  const closeButton = computed<ModalButton>(() => ({ id: 'close', label: t('button.close'), type: 'cancel', color: 'normal', customClass: 'cancel-btn' }))
  const confirmText = computed(() => confirmCopy(actionConfirm.value.target, t))
  const confirmButtons = computed<ModalButton[]>(() => [
    { id: 'confirm', label: confirmText.value.button, color: 'error' },
    cancelButton(t),
  ])
  const urlsButtons = computed<ModalButton[]>(() => [
    { id: 'add', label: copy.addUrl, color: 'primary', disabled: !urlsDialog.value.newDomain || !urlsDialog.value.newListenPort },
    closeButton.value,
  ])
  const logsButtons = computed<ModalButton[]>(() => [
    { id: 'refresh', label: t('button.refresh'), color: 'primary' },
    closeButton.value,
  ])

  function onLogsButton (id: string): void {
    if (id === 'refresh') {
      void refreshLogs()
      return
    }
    logsModal.value.open = false
  }

  // `BasicModal` renders the title as HTML: the service name and the port title are escaped.
  const logsTitle = computed(() => `${t('heading.hosting.containers.logs.title')}: ${escapeHtml(logsModal.value.service)}`)
  const urlsTitle = computed(() => escapeHtml(copy.portDialogTitle(urlsDialog.value.upstreamPort, urlsDialog.value.containerService)))

  // Confirm closes the dialog and runs the action, whose loader is in its own button; Cancel and X only close it.
  function onConfirmButton (id: string): void {
    const { group, target } = actionConfirm.value
    actionConfirm.value.open = false
    if (id !== 'confirm' || !group || !target) {
      return
    }
    if (target.scope === 'url') {
      void deletePublicUrl(target.rule)
    } else if (target.scope === 'project') {
      void doProjectAction(group, target.action)
    } else {
      void doServiceAction(group, target.service, target.action)
    }
  }

  function onUrlsButton (id: string): void {
    if (id === 'add') {
      void addPublicUrl()
      return
    }
    urlsDialog.value.open = false
  }
  // The list reloads silently this often while the page is visible; it replaces the legacy Refresh button.
  const POLL_INTERVAL_MS = 15_000
  // Every load takes a ticket: only the newest answer is written (see `loadAll`).
  let loadTicket = 0
  let logsTicket = 0
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  function asContainer (item: unknown): Container {
    return item as Container
  }

  /**
   * A silent load (the poll) shows no spinner and no alert. The rules are asked only with
   * the privilege and their error is dropped. The answer of an older load is not written; `loading` is reset by a non-silent load
   * whatever its ticket, so a poll that overtakes it cannot leave the spinner on.
   */
  async function loadAll (silent = false): Promise<void> {
    const ticket = ++loadTicket
    const serviceId = props.service.id
    if (!silent) {
      loading.value = true
    }
    try {
      const [nextGroups, nextRules] = await Promise.all([
        listContainerGroups(serviceId),
        canManageUrls.value ? listProxyRules(serviceId).catch((): ProxyRule[] => []) : Promise.resolve<ProxyRule[]>([]),
      ])
      if (ticket === loadTicket) {
        if (isProject.value) {
          // The response lists every project of the user; keep this project and the rules of its owner.
          const scoped = scopeGroups(nextGroups, props.service.server_accounts[0]?.id)
          groups.value = scoped
          proxyRules.value = scopeRules(nextRules, scoped[0]?.account?.username)
        } else {
          groups.value = nextGroups
          proxyRules.value = nextRules
        }
        loaded.value = true
      }
    } catch (error) {
      if (!silent) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (!silent) {
        loading.value = false
      }
    }
  }

  /**
   * The spinner sits on the clicked button and the whole group is disabled while the
   * request runs. A success reloads the groups without the full spinner; a failure raises an alert.
   */
  async function doProjectAction (group: ContainerGroup, action: string): Promise<void> {
    const accountId = group.account.id
    actionLoading.value[accountId] = action
    try {
      await projectAction(props.service.id, accountId, action)
      await loadAll()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      actionLoading.value[accountId] = undefined
    }
  }

  // A project action that stops or recreates containers opens the confirmation dialog; Start All runs at once.
  function confirmProjectAction (group: ContainerGroup, action: string): void {
    const target = confirmedProjectAction(action)
    if (!target) {
      void doProjectAction(group, action)
      return
    }
    actionConfirm.value = { open: true, group, target }
  }

  // The same for one container: Stop and Restart ask first, Start runs at once.
  function requestServiceAction (group: ContainerGroup, service: string, action: string): void {
    const target = confirmedServiceAction(service, action)
    if (!target) {
      void doServiceAction(group, service, action)
      return
    }
    actionConfirm.value = { open: true, group, target }
  }

  // `project` Actions menu: the items of the one group; `isActing` as in the legacy code.
  const menuActions = computed(() => projectActions(t))
  function isActing (action?: string): boolean {
    return isGroupActing(actionLoading.value, projectGroup.value?.account.id ?? null, action)
  }

  // An item of the menu runs its action on the one group, after the confirmation for Restart, Stop All and Pull & Redeploy.
  function onProjectActionSelect (id: string): void {
    const group = projectGroup.value
    if (!group) {
      return
    }
    confirmProjectAction(group, id)
  }

  /**
   * The spinner sits on the one container; its buttons and the project buttons are disabled
   * while the request runs.
   */
  /** A project action or an action of this container is running. */
  function rowBusy (group: ContainerGroup, container: Container): boolean {
    return !!actionLoading.value[group.account.id] || !!serviceLoading.value[serviceKey(group.account.id, container.Service)]
  }

  /** `action` of this container is running (its button shows the loader). */
  function rowActing (group: ContainerGroup, container: Container, action: string): boolean {
    return serviceLoading.value[serviceKey(group.account.id, container.Service)] === action
  }

  /** The one Start/Stop button: a running (or restarting) container stops, any other starts. */
  function toggleAction (state: string): 'start' | 'stop' {
    return canStop(state) ? 'stop' : 'start'
  }

  function toggleLabel (state: string): string {
    return t(`heading.hosting.containers.service.${toggleAction(state)}`)
  }

  async function doServiceAction (group: ContainerGroup, service: string, action: string): Promise<void> {
    const key = serviceKey(group.account.id, service)
    if (serviceLoading.value[key]) {
      return
    }
    serviceLoading.value[key] = action
    try {
      await serviceAction(props.service.id, group.account.id, service, action)
      await loadAll()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      serviceLoading.value[key] = undefined
    }
  }

  // The dialog opens with the spinner and then asks for the log.
  async function openLogs (group: ContainerGroup, service: string): Promise<void> {
    logsModal.value = { open: true, loading: true, accountId: group.account.id, service, content: '' }
    await refreshLogs()
  }

  /**
   * A failed request writes the error text into the log block and raises no alert.
   * Only the newest request writes (a late log of an earlier container or refresh is dropped), as `loadAll` does.
   */
  async function refreshLogs (): Promise<void> {
    const { accountId, service } = logsModal.value
    if (accountId === null) {
      return
    }
    const ticket = ++logsTicket
    logsModal.value.loading = true
    let content: string
    try {
      content = await containerLogs(props.service.id, accountId, service)
    } catch {
      content = t('heading.hosting.containers.logs.error')
    }
    if (ticket === logsTicket) {
      logsModal.value.content = content
      logsModal.value.loading = false
    }
  }

  /**
   * The dialog opens at once with the rules of the port and the domain select loading;
   * the domains of the account are asked after that, and a failure only leaves the select without options.
   */
  async function openManageUrls (group: ContainerGroup, container: Container, presetPort: number | null = null): Promise<void> {
    const hostPorts = parseHostPorts(container.Ports)
    const upstreamPort = presetPort || (hostPorts.length > 0 ? hostPorts[0] : null)
    const rulesForContainer = proxyRules.value.filter(rule => rule.transport === 'http' && rule.upstream_port === upstreamPort)

    urlsDialog.value = {
      open: true,
      saving: false,
      deletingId: null,
      group,
      containerService: container.Service,
      hostPorts,
      upstreamPort,
      rulesForContainer,
      newListenPort: String(upstreamPort || ''),
      newDomain: null,
      domainOptions: [],
      domainsLoading: true,
    }
    // The dialog object is kept: a later open replaces `urlsDialog.value`, and a slow answer for this account must not reach it.
    const dialog = urlsDialog.value

    try {
      const domainItems = (await listDomains(group.account.id))
        .filter((item): item is { domain: string } => !!item.domain)
        .map(item => ({ label: item.domain, value: item.domain }))
      dialog.domainOptions = domainItems
      // Legacy prefers the account's primary domain when it is in the list.
      const primary = group.account.domain
      dialog.newDomain = (primary && domainItems.some(item => item.value === primary) ? primary : null)
        || (domainItems.length > 0 ? domainItems[0].value : null)
    } catch {
      dialog.domainOptions = []
    } finally {
      dialog.domainsLoading = false
    }
  }

  /** Another port of the container in the dialog: its rules and the listen port follow it. */
  function selectUrlsPort (port: number): void {
    const dialog = urlsDialog.value
    dialog.upstreamPort = port
    dialog.rulesForContainer = proxyRules.value.filter(rule => rule.transport === 'http' && rule.upstream_port === port)
    dialog.newListenPort = String(port)
  }

  /**
   * A port outside 1–65535 does nothing. The alert comes first, then the reload, then the
   * dialog closes; a failure keeps the dialog open.
   */
  async function addPublicUrl (): Promise<void> {
    const dialog = urlsDialog.value
    // A request is already running (Enter on the focused button still clicks it while it shows the spinner).
    if (dialog.saving || dialog.deletingId !== null) {
      return
    }
    const listenPort = Number.parseInt(dialog.newListenPort)
    const { group, upstreamPort, newDomain } = dialog
    if (!listenPort || listenPort < 1 || listenPort > 65_535 || !group || upstreamPort === null) {
      return
    }
    if (!newDomain) {
      alerts.addAlert({ success: false, errorMessage: copy.selectDomain })
      return
    }

    dialog.saving = true
    try {
      await createProxyRule(props.service.id, {
        transport: 'http',
        listen_ip: null,
        listen_port: listenPort,
        server_name: newDomain,
        upstream_host: group.account.username,
        upstream_port: upstreamPort,
        upstream_protocol: 'http',
        enabled: true,
      })
      alerts.addAlert({ success: true, successMessage: copy.publicUrlAdded })
      await loadAll()
      dialog.open = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      dialog.saving = false
    }
  }

  // The trash icon of a rule asks first: the danger dialog opens over the URLs dialog, and its Remove deletes the rule.
  function confirmRemoveUrl (rule: ProxyRule): void {
    const dialog = urlsDialog.value
    if (!dialog.group || dialog.saving || dialog.deletingId !== null) {
      return
    }
    actionConfirm.value = {
      open: true,
      group: dialog.group,
      target: { scope: 'url', rule, url: buildUrlFromRule(rule, serverIp.value), service: dialog.containerService },
    }
  }

  /**
   * After the confirmation: alert, then reload. Unlike legacy the URLs dialog stays
   * open (only the confirmation closes) and lists the URLs of its port as the reload left them.
   */
  async function deletePublicUrl (rule: ProxyRule): Promise<void> {
    const dialog = urlsDialog.value
    if (dialog.saving || dialog.deletingId !== null) {
      return
    }
    dialog.deletingId = rule.id
    try {
      await deleteProxyRule(props.service.id, rule.id)
      alerts.addAlert({ success: true, successMessage: copy.publicUrlRemoved })
      await loadAll()
      // Without the removed rule also when the reload failed (its alert is up and `proxyRules` still holds the rule).
      dialog.rulesForContainer = proxyRules.value
        .filter(item => item.transport === 'http' && item.upstream_port === dialog.upstreamPort && item.id !== rule.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      dialog.deletingId = null
    }
  }

  onMounted(() => {
    void loadAll()
    refreshTimer = setInterval(() => {
      // A hidden tab skips the refresh.
      if (!isPageHidden()) {
        void loadAll(true)
      }
    }, POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    clearInterval(refreshTimer)
  })
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.container {
  max-width: 100%;
}

// `hosting` group header: the V2 small contained buttons use the V2 button surface (#F5F5F5), the title `subtitle-1` has a 28px line.
.containers-group-btn {
  background-color: var(--v-btn-surface);
}

.containers-group-title {
  line-height: 1.75rem;
}

// V2 `grey--text` (#9E9E9E) of the hint texts (no-data, URL preview), not the project `gray`.
.containers-hint {
  color: var(--v-grey-base-material);
}

// A long image name (`registry/owner/name:tag`) stays on one line and is cut with an ellipsis.
.containers-image {
  display: block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.containers-uptime {
  white-space: nowrap;
}

// Legacy `<v-card-text style="max-height: 60vh; overflow-y: auto;">` (Logs dialog).
.logs-dialog-body {
  max-height: 60vh;
  overflow-y: auto;
}

// Legacy `<v-card-text style="max-height: 70vh; overflow-y: auto;">` (Manage public URLs dialog).
.urls-dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}

// V2 dense `v-list-item` of the existing URLs: 56px row without the V4 compact padding, 13px/500 green link, 12px/500 subtitle
// (0.6 grey), 32px icon button with the 0.54 icon colour (V4: 52px row, 16px link in the browser blue, 14px subtitle, 44px button).
.urls-rule.v-list-item {
  min-height: 56px;
  padding-top: 0;
  padding-bottom: 0;
}

.urls-rule .v-list-item-title {
  line-height: 1.0625rem;
  margin-bottom: 1.5px;
}

.urls-rule :deep(.v-list-item__append) {
  margin-inline-start: 16px;
}

.urls-rule-link {
  color: var(--v-primary-base);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1rem;
}

.urls-rule-sub.v-list-item-subtitle {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 1;
}

.urls-rule-remove.v-btn {
  width: 32px;
  height: 32px;
}

.v-theme--dark .urls-rule-sub.v-list-item-subtitle {
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.v-theme--light .urls-rule-remove.v-btn {
  color: rgba(var(--v-theme-on-surface), 0.54);
}

// Legacy `<div style="gap: 6px">` (domain select and listen port row).
.urls-form-row {
  gap: 6px;
}

// Legacy `<v-select style="flex: 1">`; the V2 select keeps its natural width (158px) on a narrow dialog, the V4 one shrinks to 94px.
.urls-domain-select {
  flex: 1;
  min-width: 158px;
}

// Legacy `<v-text-field style="width: 90px; flex: none">`.
.urls-port-field {
  width: 90px;
  flex: none;
}

// A dark console block in both themes.
.logs-pre {
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  background: map.get(v.$log-console, bg);
  color: map.get(v.$log-console, text);
  padding: 16px;
  border-radius: 4px;
  margin: 0;
}
</style>
