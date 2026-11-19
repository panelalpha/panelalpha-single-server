<template>
  <div
    class="instance-logs"
    data-testid="instance-logs"
  >
    <!-- The frame of the other Advanced pages (MySQL Databases): the "Logs" heading with the controls of the active tab beside it, the tab
         strip in a second row. Legacy put the tab strip in the title box and had no heading. -->
    <PageTitle
      :title="t('heading.instance.advanced.logs.title')"
      title-testid="logs-title"
      variant="advanced"
    >
      <template #filters>
        <div class="logs-filters">
          <!-- The controls of the active tab. The webserver file select comes with its tab. -->
          <data-iterator-filter-controls
            v-if="tab === 'instance'"
            :search-term="searchTerm"
            :show-search-term="true"
            @update:search-term="handleSearchTermChange"
          />

          <!-- The search of the webserver tab filters the loaded page (`LogLinesTable`), it sends nothing to the API. -->
          <data-iterator-filter-controls
            v-if="tab === 'webserver' && selectedWebserverLogFile?.plain_text"
            :search-term="webserverSearchTerm"
            :show-search-term="true"
            @update:search-term="webserverSearchTerm = $event"
          />

          <!-- Same for the PHP tab: the search filters the loaded page, it sends nothing to the API. -->
          <data-iterator-filter-controls
            v-if="tab === 'php'"
            :search-term="phpSearchTerm"
            :show-search-term="true"
            @update:search-term="phpSearchTerm = $event"
          />

          <!-- The search of the deploy tab filters all lines of the selected run, in the browser. -->
          <data-iterator-filter-controls
            v-if="tab === 'deploy' && deployLogs.length > 0"
            :search-term="deploySearchTerm"
            :show-search-term="true"
            @update:search-term="deploySearchTerm = $event"
          />

          <!-- The webserver file select, each row with the file size and a download button. -->
          <v-select
            v-if="tab === 'webserver'"
            class="dns-zone v-input--lg"
            hide-details
            item-title="name"
            item-value="name"
            :items="webserverLogs"
            :menu-props="{ offset: 8 }"
            :model-value="selectedWebserverLogFile"
            return-object
            variant="outlined"
            @update:model-value="handleChangeLogFile"
          >
            <template #selection="{ item }">
              <div>{{ item.name }}</div>
            </template>

            <template #item="{ item, props: itemProps }">
              <v-list-item
                v-bind="itemProps"
                :title="undefined"
              >
                <div class="d-flex justify-space-between align-center w-100">
                  <div class="text-truncate">
                    {{ item.name }}
                  </div>

                  <div class="d-flex align-center">
                    <span v-if="item.size !== null">{{ formatLogSize(String(item.size)) }}</span>

                    <AppButton
                      :aria-label="t('button.download')"
                      class="ml-4"
                      icon
                      kind="primary"
                      size="x-small"
                      @click="downloadWebserverLogsFile(item.name)"
                    >
                      <v-icon icon="$downloadcloud" />
                    </AppButton>
                  </div>
                </div>
              </v-list-item>
            </template>
          </v-select>

          <!-- Deploy runs: shown on the deploy tab once the list has runs. Label, LIVE badge, source and duration. -->
          <v-select
            v-if="tab === 'deploy' && deployLogs.length > 0"
            class="dns-zone v-input--lg deploy-logs-select"
            hide-details
            item-value="id"
            :items="deployLogs"
            :menu-props="{ offset: 8 }"
            :model-value="selectedDeployLogId"
            variant="outlined"
            @update:model-value="selectedDeployLogId = $event"
          >
            <template #selection="{ item }">
              <div class="d-flex justify-space-between align-center w-100">
                <div class="text-truncate">
                  {{ deploySelectLabel(item, t) }}
                  <span
                    v-if="item.status === 'running'"
                    class="ml-2 p-xxs font-weight-bold text-uppercase logs-live-badge"
                  >{{ t('deployLogs.live') }}</span>
                </div>
              </div>
            </template>

            <template #item="{ item, props: itemProps }">
              <v-list-item
                v-bind="itemProps"
                :title="undefined"
              >
                <div class="d-flex justify-space-between align-center w-100">
                  <div class="text-truncate">
                    {{ deploySelectLabel(item, t) }}
                    <span
                      v-if="item.status === 'running'"
                      class="ml-2 p-xxs font-weight-bold text-uppercase logs-live-badge"
                    >{{ t('deployLogs.live') }}</span>
                  </div>

                  <div class="d-flex align-center flex-shrink-0 ml-4 p-xxs text--gray-darken1">
                    {{ deploySourceLabel(item, t) }}
                    <span
                      v-if="formatDuration(item.started_at, item.finished_at)"
                      class="ml-1"
                    >
                      · {{ formatDuration(item.started_at, item.finished_at) }}
                    </span>
                  </div>
                </div>
              </v-list-item>
            </template>
          </v-select>

          <!-- Download of the active tab, beside its search and select. Always there on a tab that can download (no jump when the content
               loads), disabled while it loads or when there is nothing to save. -->
          <PageAddButton
            v-if="headerDownload"
            data-testid="logs-download"
            :disabled="!headerDownload.enabled"
            icon="$downloadcloud"
            :label="t('button.download')"
            :loading="headerDownload.busy"
            @click="headerDownload.run()"
          />
        </div>
      </template>

      <template #bottom>
        <v-row>
          <v-col class="page-title__tabs d-flex align-center">
            <v-tabs
              v-if="tabs.length > 0"
              v-model="tab"
              class="logs-tabs"
            >
              <v-tab
                v-if="tabs.includes('instance')"
                :ripple="false"
                :value="'instance'"
              >
                {{ t('heading.instance.advanced.logs.instanceLogs.title') }}
              </v-tab>

              <v-tab
                v-if="tabs.includes('deploy')"
                :ripple="false"
                :value="'deploy'"
              >
                {{ t('deployLogs.title') }}
              </v-tab>

              <v-tab
                v-if="tabs.includes('wordpress')"
                :ripple="false"
                :value="'wordpress'"
              >
                {{ t('heading.instance.advanced.logs.wordpressLogs.title') }}
              </v-tab>

              <v-tab
                v-if="tabs.includes('php')"
                :ripple="false"
                :value="'php'"
              >
                <span>{{ t('heading.instance.advanced.logs.phpLogs.title') }}</span>

                <v-tooltip
                  location="bottom"
                  :offset="4"
                  :open-delay="150"
                  transition="custom-tooltip"
                  :z-index="99"
                >
                  <template #activator="{ props: activatorProps }">
                    <v-icon
                      v-bind="activatorProps"
                      class="ml-2 logs-tab-info"
                      icon="$infoCircle"
                      size="16"
                    />
                  </template>

                  <span>{{ t('heading.instance.advanced.logs.phpLogs.tooltip') }}</span>
                </v-tooltip>
              </v-tab>

              <v-tab
                v-if="tabs.includes('webserver')"
                :ripple="false"
                :value="'webserver'"
              >
                {{ t('heading.instance.advanced.logs.webserverLogs.title') }}
              </v-tab>
            </v-tabs>
          </v-col>
        </v-row>
      </template>
    </PageTitle>

    <v-window
      v-if="tabs.length > 0"
      v-model="tab"
      class="overflow-visible"
    >
      <v-window-item
        v-if="tabs.includes('instance')"
        :transition="false"
        :value="'instance'"
      >
        <v-container class="px-0">
          <v-row>
            <v-col cols="12">
              <!-- A failed GET shows the error with Retry instead of the "No logs yet" empty state (legacy swallowed it). -->
              <error-card
                v-if="instanceLogsError !== null"
                data-testid="instance-logs-error"
                :message="instanceLogsError"
              >
                <template #action>
                  <AppButton
                    data-testid="instance-logs-retry"
                    kind="field"
                    :loading="itemsLoading"
                    type="button"
                    @click="loadInstanceLogs"
                  >
                    {{ t('button.retry') }}
                  </AppButton>
                </template>
              </error-card>

              <logs-table
                v-else
                :headers="LOG_HEADERS"
                :items="itemsLoading ? [] : items"
                :items-loading="itemsLoading"
                :items-per-page="itemsPerPage"
                :items-total="itemsTotal"
                :page="page"
                :possible-items-per-page="LOGS_POSSIBLE_PER_PAGE"
                :search-term="searchTerm"
                :sort-by="sortBy"
                :sort-desc="sortDesc"
                @clear-filters="clearFilters"
                @update:items-per-page="changePerPage"
                @update:page="changePage"
                @update:sort-by="changeSortBy"
                @update:sort-desc="changeSortDesc"
              />
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <!-- Deploy tab. The run list and the selected run live in this view, the tab only renders them. -->
      <v-window-item
        v-if="tabs.includes('deploy')"
        :transition="false"
        :value="'deploy'"
      >
        <v-container class="px-0">
          <v-row>
            <v-col cols="12">
              <div>
                <deploy-logs-tab
                  :instance-id="instance.id"
                  :list-loading="loadingDeployLogs"
                  :search-term="deploySearchTerm"
                  :selected-log="selectedDeployLog"
                  @clear-filters="deploySearchTerm = ''"
                  @download-target="deployDownloadLogId = $event"
                  @terminal="onDeployTerminal"
                />
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <!-- WordPress tab. Loader 344px, then the info row with Download and the `<pre>`, or the empty state. -->
      <v-window-item
        v-if="tabs.includes('wordpress')"
        :transition="false"
        :value="'wordpress'"
      >
        <v-container class="px-0">
          <v-row>
            <v-col cols="12">
              <!-- While the log loads the table skeleton stands in (same as the other log tabs); the text itself is not a table. -->
              <log-lines-table
                v-if="loadingWordPressLogs"
                kind="error"
                loading
                :rows="[]"
              />

              <v-card
                v-else
                elevation="4"
              >
                <logs-no-data
                  v-if="!wordPressLogs"
                  class="logs-panel-height"
                  :description="t('message.emptyTable.wpErrorLogs.description')"
                  :title="t('message.emptyTable.wpErrorLogs.title')"
                />

                <logs-text-panel
                  v-else
                  align-center
                  :text="wordPressLogs"
                />
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <!-- PHP tab: a table of parsed entries, paged by the API. An empty log shows the PHP empty state. -->
      <v-window-item
        v-if="tabs.includes('php')"
        :transition="false"
        :value="'php'"
      >
        <v-container class="px-0">
          <v-row>
            <v-col cols="12">
              <div>
                <log-lines-table
                  :has-more="phpPage < phpPages"
                  kind="php"
                  :loading="loadingPhpLogs"
                  :loading-more="loadingMorePhpLogs"
                  :rows="phpRows"
                  :search-term="phpSearchTerm"
                  @clear-filters="phpSearchTerm = ''"
                  @load-more="loadMorePhpLogs"
                />
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <!-- Webserver tab. Binary files get the Download state, an empty list the empty state, and the header row shows only for text with content. -->
      <v-window-item
        v-if="tabs.includes('webserver')"
        :transition="false"
        :value="'webserver'"
      >
        <v-container class="px-0">
          <v-row>
            <v-col cols="12">
              <div>
                <!-- While the file list loads the table skeleton stands in, so the "no files" empty state does not flash first. -->
                <log-lines-table
                  v-if="loadingWebserverLogs || selectedWebserverLogFile?.plain_text"
                  :key="selectedWebserverLogFile?.name"
                  :has-more="webserverPage < webserverPages"
                  :kind="selectedWebserverLogFile ? logKindForFile(selectedWebserverLogFile.name) : 'access'"
                  :loading="loadingWebserverLogs || loadingWebserverLogContent"
                  :loading-more="loadingMoreWebserverLogContent"
                  :rows="webserverRows"
                  :search-term="webserverSearchTerm"
                  @clear-filters="webserverSearchTerm = ''"
                  @load-more="loadMoreWebserverLogContent"
                />

                <v-card
                  v-else
                  elevation="4"
                >
                  <logs-no-data
                    v-if="selectedWebserverLogFile"
                    :btn-download="true"
                    class="logs-panel-height"
                    :description="t('message.emptyTable.webserverLogs.downloadDescription')"
                    :title="t('message.emptyTable.webserverLogs.downloadTitle')"
                    @download="downloadSelectedWebserverLog"
                  />

                  <logs-no-data
                    v-else
                    class="logs-panel-height"
                    :description="t('message.emptyTable.webserverLogs.description')"
                    :title="t('message.emptyTable.webserverLogs.title')"
                  />
                </v-card>
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>
    </v-window>
  </div>
</template>

<script lang="ts" setup>
  import type { LogRow } from './log-lines'
  // Tabs and their order come from `logs-tabs.ts` (the app-lite order). The instance tab loads on mount.
  import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
  import type { InstanceLogRow, WebserverLogFile } from '@/entities/project/instance-logs.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import { downloadDeployLog, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
  import {
    getInstanceLogs,
    getPhpLogPage,
    getWebserverLogPage,
    getWebserverLogs,
    getWordPressLogs,
    isLogPageConflict,
    phpLogsDownloadUrl,
    webserverLogDownloadUrl,
    wordPressLogsDownloadUrl,
  } from '@/entities/project/instance-logs.api'
  import { formatDuration, pickDefaultDeployLog } from '@/entities/project/ui/deploy/deploy-log-ui'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { deploySelectLabel, deploySourceLabel } from './deploy-logs-select'
  import DeployLogsTab from './DeployLogsTab.vue'
  import { logKindForFile, parseLogPage } from './log-lines'
  import { formatLogSize } from './log-lines-table'
  import LogLinesTable from './LogLinesTable.vue'
  import { DATE_HEADER, LOG_HEADERS, LOGS_PAGE_SIZE, LOGS_POSSIBLE_PER_PAGE } from './logs-table'
  import { availableLogTabs, initialLoads, type LogsTab } from './logs-tabs'
  import LogsNoData from './LogsNoData.vue'
  import LogsTable from './LogsTable.vue'
  import LogsTextPanel from './LogsTextPanel.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()

  const tabs = computed(() => availableLogTabs(props.instance))

  // `tab` starts at index 0, which is the first available tab (the mounted hook then loads it).
  const tab = ref<LogsTab | null>(tabs.value[0] ?? null)

  const items = ref<InstanceLogRow[]>([])
  const itemsTotal = ref(0)
  const itemsLoading = ref(true)
  // Message of the last failed GET of the instance log list; null when the last load worked.
  const instanceLogsError = ref<string | null>(null)

  // The server pages, sorts and searches, so every change
  // reloads (no `serverProvided: false`); each change resets the page to 1 as legacy does.
  const {
    page,
    itemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
    clearFilters,
  } = useDataIteratorPageState({
    load: () => loadInstanceLogs(),
    itemsPerPage: LOGS_PAGE_SIZE,
    possibleItemsPerPage: LOGS_POSSIBLE_PER_PAGE,
    sortBy: DATE_HEADER,
    sortDesc: true,
  })

  // Only the newest response counts: a quick change of page, size, sort or term can overlap an earlier request (legacy had no guard).
  let latestInstanceLogsRequest = 0

  // Legacy swallowed a failed request. Now the error is shown in the content, not as an alert.
  async function loadInstanceLogs (): Promise<void> {
    const request = ++latestInstanceLogsRequest
    itemsLoading.value = true
    try {
      const response = await getInstanceLogs(props.instance.id, {
        page: page.value,
        perPage: Number(itemsPerPage.value),
        sortBy: sortBy.value ? sortBy.value.value : DATE_HEADER.value,
        sortDir: sortDesc.value ? 'desc' : 'asc',
        searchTerm: searchTerm.value,
      })
      if (request !== latestInstanceLogsRequest) {
        return
      }
      items.value = response.items
      itemsTotal.value = response.total
      instanceLogsError.value = null
    } catch (error) {
      if (request === latestInstanceLogsRequest) {
        instanceLogsError.value = getErrorMessage(error)
      }
    } finally {
      if (request === latestInstanceLogsRequest) {
        itemsLoading.value = false
      }
    }
  }

  const alerts = useAlertsStore()

  // `wordPressErrorLogs` starts `null`: `null` means "not loaded yet", which is what makes the tab load once.
  const wordPressLogs = ref<string | null>(null)
  const loadingWordPressLogs = ref(tabs.value[0] === 'wordpress')

  // A failed request alerts and leaves the value as it was.
  async function loadWordPressLogs (): Promise<void> {
    loadingWordPressLogs.value = true
    try {
      wordPressLogs.value = await getWordPressLogs(props.instance.id)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loadingWordPressLogs.value = false
    }
  }

  // The PHP log is read window by window like the webserver files: page 1 without `size`, the older pages with
  // the `size` of the last response, appended to the rows (the table pages them in the browser). An API that cannot page (dind) answers one
  // page with `size: null`. The tab loads once, on the first entry.
  const phpRows = ref<LogRow[]>([])
  const phpPage = ref(1)
  const phpPages = ref(1)
  const phpSize = ref<number | null>(null)
  const phpSearchTerm = ref('')
  const loadingPhpLogs = ref(tabs.value[0] === 'php')
  const loadingMorePhpLogs = ref(false)
  const phpLoaded = ref(false)

  // Only the newest response counts: a quick change of page can overlap an earlier request.
  let latestPhpRequest = 0

  // Same rules as `loadWebserverLogContent`: another `size` in the answer or a 409 sends the view back to page 1 asked without `size`;
  // a failed request alerts and keeps the previous rows (the tab stays "not loaded", so the next entry tries again).
  async function loadPhpLogContent (pageNumber = 1, size: number | null = null): Promise<void> {
    const request = ++latestPhpRequest
    const append = pageNumber > 1
    loadingPhpLogs.value = !append
    loadingMorePhpLogs.value = append
    try {
      const response = await getPhpLogPage(props.instance.id, { page: pageNumber, size })
      if (request !== latestPhpRequest) {
        return
      }
      if (size !== null && response.size !== size) {
        void loadPhpLogContent()
        return
      }
      const rows = parseLogPage('php', response.lines, pageNumber)
      phpRows.value = append ? [...phpRows.value, ...rows] : rows
      phpPage.value = pageNumber
      phpPages.value = response.pages
      phpSize.value = response.size
      phpLoaded.value = true
    } catch (error) {
      if (request !== latestPhpRequest) {
        return
      }
      if (size !== null && isLogPageConflict(error)) {
        void loadPhpLogContent()
        return
      }
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (request === latestPhpRequest) {
        loadingPhpLogs.value = false
        loadingMorePhpLogs.value = false
      }
    }
  }

  // The table asks for the next older window when the user pages past the loaded rows.
  function loadMorePhpLogs (): void {
    if (!loadingMorePhpLogs.value && phpPage.value < phpPages.value) {
      void loadPhpLogContent(phpPage.value + 1, phpSize.value)
    }
  }

  function downloadWordPressLogs (): void {
    window.open(wordPressLogsDownloadUrl(props.instance.id), '_blank')
  }

  function downloadPhpLogs (): void {
    window.open(phpLogsDownloadUrl(props.instance.id), '_blank')
  }

  // Webserver state. `selectedWebserverLogFile` is `null` when the list is empty, where legacy held `undefined`.
  const webserverLogs = ref<WebserverLogFile[]>([])
  const selectedWebserverLogFile = ref<WebserverLogFile | null>(null)
  // Tabs that load on mount start in the loading state, so the first paint shows the skeleton and not the empty state.
  const loadingWebserverLogs = ref(tabs.value.includes('webserver'))
  const loadingWebserverLogContent = ref(false)
  const loadingMoreWebserverLogContent = ref(false)

  // The first file is selected. A failed request alerts and keeps the previous list.
  async function loadWebserverLogs (): Promise<void> {
    loadingWebserverLogs.value = true
    try {
      const files = await getWebserverLogs(props.instance.id)
      webserverLogs.value = files
      selectedWebserverLogFile.value = files[0] ?? null
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loadingWebserverLogs.value = false
    }
  }

  // The text file is read window by window. Page 1 is asked without `size`, which fixes the file size; the older
  // pages send the `size` of the last response, so lines appended meanwhile do not shift the numbering. Their rows are appended: the table
  // pages all loaded rows in the browser (15, 50 or 100 a page) and asks for the next window past the last of them.
  const webserverRows = ref<LogRow[]>([])
  const webserverPage = ref(1)
  const webserverPages = ref(1)
  const webserverSize = ref<number | null>(null)
  const webserverSearchTerm = ref('')

  // Only the newest response counts: a quick change of file or page can overlap an earlier request (legacy had no guard).
  let latestWebserverContentRequest = 0

  // A different `size` in the answer (the file shrank) or a 409 (rotation) sends the view back to page 1, asked without `size`.
  // A failed request alerts and keeps the previous rows.
  async function loadWebserverLogContent (file: WebserverLogFile, pageNumber = 1, size: number | null = null): Promise<void> {
    const request = ++latestWebserverContentRequest
    const append = pageNumber > 1
    loadingWebserverLogContent.value = !append
    loadingMoreWebserverLogContent.value = append
    try {
      const response = await getWebserverLogPage(props.instance.id, file.name, { page: pageNumber, size })
      if (request !== latestWebserverContentRequest) {
        return
      }
      if (size !== null && response.size !== size) {
        void loadWebserverLogContent(file)
        return
      }
      const rows = parseLogPage(logKindForFile(file.name), response.lines, pageNumber)
      webserverRows.value = append ? [...webserverRows.value, ...rows] : rows
      webserverPage.value = pageNumber
      webserverPages.value = response.pages
      webserverSize.value = response.size
    } catch (error) {
      if (request !== latestWebserverContentRequest) {
        return
      }
      if (size !== null && isLogPageConflict(error)) {
        void loadWebserverLogContent(file)
        return
      }
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (request === latestWebserverContentRequest) {
        loadingWebserverLogContent.value = false
        loadingMoreWebserverLogContent.value = false
      }
    }
  }

  // The table asks for the next older window when the user pages past the loaded rows.
  function loadMoreWebserverLogContent (): void {
    const file = selectedWebserverLogFile.value
    if (file?.plain_text && !loadingMoreWebserverLogContent.value && webserverPage.value < webserverPages.value) {
      void loadWebserverLogContent(file, webserverPage.value + 1, webserverSize.value)
    }
  }

  function downloadWebserverLogsFile (filename: string): void {
    window.open(webserverLogDownloadUrl(props.instance.id, filename), '_blank')
  }

  function downloadSelectedWebserverLog (): void {
    if (selectedWebserverLogFile.value) {
      downloadWebserverLogsFile(selectedWebserverLogFile.value.name)
    }
  }

  // A newly picked text file reloads its content only while the tab is open.
  function handleChangeLogFile (file: WebserverLogFile | null): void {
    selectedWebserverLogFile.value = file
    if (tab.value === 'webserver' && file?.plain_text) {
      void loadWebserverLogContent(file)
    }
  }

  // Deploy state. The run list and the selected run belong to the view, the header select
  // and the tab read them. `selectedDeployLogId` starts `null`.
  const deployLogs = ref<DeployLogEntry[]>([])
  const selectedDeployLogId = ref<number | string | null>(null)
  const loadingDeployLogs = ref(tabs.value.includes('deploy'))
  const deploySearchTerm = ref('')
  const selectedDeployLog = computed(() => deployLogs.value.find(log => log.id === selectedDeployLogId.value) ?? null)

  // A response that is not an array empties the list. `preserveSelection` keeps the
  // picked run after a `terminal` reload; otherwise the newest run of the list (the API's order) is picked, not an older failed one.
  async function loadDeployLogs (preserveSelection = false): Promise<void> {
    loadingDeployLogs.value = true
    try {
      const logs = await listDeployLogs(props.instance.id)
      deployLogs.value = Array.isArray(logs) ? logs : []
      const picked = pickDefaultDeployLog(deployLogs.value, preserveSelection ? selectedDeployLogId.value : null)
      selectedDeployLogId.value = picked ? picked.id : null
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loadingDeployLogs.value = false
    }
  }

  // The run the deploy viewer would save (`DeployLogsTabViewer`: a finished run with lines). The Download of the header calls the API here.
  const deployDownloadLogId = ref<number | string | null>(null)

  const deployDownloading = ref(false)

  async function downloadDeployRun (): Promise<void> {
    if (deployDownloadLogId.value === null || deployDownloading.value) {
      return
    }
    deployDownloading.value = true
    try {
      await downloadDeployLog(props.instance.id, deployDownloadLogId.value)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      deployDownloading.value = false
    }
  }

  interface HeaderDownload {
    enabled: boolean
    busy: boolean
    run: () => void
  }

  // Download of the page title, per tab. Every tab with a download shows it all the time (the title row does not jump when the content
  // loads); it is enabled only when the tab has something to save. The Project Logs tab has no download (`null`).
  const headerDownload = computed<HeaderDownload | null>(() => {
    switch (tab.value) {
      case 'wordpress': {
        return { enabled: !loadingWordPressLogs.value && Boolean(wordPressLogs.value), busy: false, run: downloadWordPressLogs }
      }
      case 'php': {
        return { enabled: !loadingPhpLogs.value && phpRows.value.length > 0, busy: false, run: downloadPhpLogs }
      }
      case 'webserver': {
        // A binary file has no rows but can be downloaded (its empty state has the same button); a text file needs its rows loaded.
        const file = selectedWebserverLogFile.value
        const enabled = !loadingWebserverLogs.value && file !== null
          && (!file.plain_text || (!loadingWebserverLogContent.value && webserverRows.value.length > 0))
        return { enabled, busy: false, run: downloadSelectedWebserverLog }
      }
      case 'deploy': {
        const enabled = !loadingDeployLogs.value && selectedDeployLog.value !== null && deployDownloadLogId.value !== null
        return { enabled, busy: deployDownloading.value, run: () => void downloadDeployRun() }
      }
      default: {
        return null
      }
    }
  })

  // The tab reports a finished deploy and the list reloads, keeping the selection.
  function onDeployTerminal (): void {
    void loadDeployLogs(true)
  }

  // Not immediate: legacy starts `tab` at 0 and `mounted` loads the first tab itself,
  // so an immediate watch would load WordPress and PHP twice.
  watch(tab, value => {
    if (value === 'wordpress' && wordPressLogs.value === null) {
      void loadWordPressLogs()
    }
    if (value === 'php' && !phpLoaded.value) {
      void loadPhpLogContent()
    }
    // Webserver reloads on every entry (no null guard, unlike WordPress and PHP).
    const file = selectedWebserverLogFile.value
    if (value === 'webserver' && file?.plain_text) {
      void loadWebserverLogContent(file)
    }
  })

  // The first tab's own load starts first, then the instance list, then the webserver file list
  // in the background. A webserver first tab awaits its file list before the content of the first file.
  onMounted(async () => {
    const { first, background } = initialLoads(tabs.value)
    if (first === 'wordpress') {
      void loadWordPressLogs()
    }
    if (first === 'php') {
      void loadPhpLogContent()
    }
    if (first === 'webserver') {
      await loadWebserverLogs()
      const file = selectedWebserverLogFile.value
      if (file?.plain_text) {
        void loadWebserverLogContent(file)
      }
    }
    if (tabs.value.includes('instance')) {
      void loadInstanceLogs()
    }
    if (background.includes('deploy')) {
      void loadDeployLogs()
    }
    if (background.includes('webserver')) {
      void loadWebserverLogs()
    }
  })
</script>

<style
  lang="scss"
  src="./LogsView.scss"
/>
