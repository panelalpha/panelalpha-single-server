<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project` uses the global `.page-title--advanced` frame. -->
    <PageTitle
      v-if="isProject"
      :filters-visible="current.items.length > 0"
      :title="t('heading.hosting.databases.title')"
      title-testid="databases-title"
      variant="advanced"
    >
      <template #filters>
        <DataIteratorFilterControls
          class="my-hostings-search"
          data-testid="databases-filter-controls"
          :full-width-lg="false"
          :full-width-md="true"
          :full-width-search="false"
          :keys="current.headers"
          :search-term="current.search"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          data-testid="databases-add"
          :label="addText"
          :loading="current.loading"
          @click="onAddClick"
        />
      </template>

      <template #bottom>
        <v-row>
          <v-col class="page-title__tabs d-flex align-center">
            <DatabasesTabs
              v-if="showTabs"
              v-model="tab"
              :can-manage-mysql="canManageMysql"
              :can-phpmyadmin-sso="canPhpmyadminSso"
            />
          </v-col>
        </v-row>
      </template>
    </PageTitle>

    <!-- My server: the tab strip and the filters (not a page title: no heading). -->
    <v-container
      v-else
      class="container px-0 py-3"
    >
      <v-row :class="['page-tab-filters-controls', mdAndDown ? 'flex-column' : '']">
        <v-col class="page-title__tabs d-flex align-center">
          <DatabasesTabs
            v-if="showTabs"
            v-model="tab"
            :can-manage-mysql="canManageMysql"
            :can-phpmyadmin-sso="canPhpmyadminSso"
          />
        </v-col>

        <v-col
          v-show="current.items.length > 0"
          class="page-title__filter-controls justify-end align-end"
          :class="mobile ? 'pb-3' : ''"
        >
          <ActiveServerAccountSelector
            v-if="service.server_accounts.length > 1"
            v-model="selectedAccount"
            class="mr-4 title-bar"
            :items="service.server_accounts"
          />

          <DataIteratorFilterControls
            class="my-hostings-search"
            data-testid="databases-filter-controls"
            :full-width-lg="false"
            :full-width-md="true"
            :full-width-search="false"
            :keys="current.headers"
            :search-term="current.search"
            :show-search-term="true"
            @update:search-term="handleSearchTermChange"
          />

          <PageAddButton
            data-testid="databases-add"
            :label="addText"
            :loading="current.loading"
            @click="onAddClick"
          />
        </v-col>
      </v-row>
    </v-container>

    <v-window
      v-if="showTabs"
      v-model="tab"
    >
      <v-window-item
        v-if="canManageMysql"
        :transition="false"
        :value="DATABASES"
      >
        <v-container :class="isProject ? 'mt-3 px-0 pt-7' : 'mt-3 px-0 py-3'">
          <v-row>
            <v-col cols="12">
              <div>
                <DataTable
                  :headers="databasesTable.headers"
                  :item-class="databaseItemClass"
                  :item-slots="['updated_at']"
                  :items="databasesTable.items"
                  :items-loading="databasesTable.loading"
                  :items-per-page="itemsPerPage as number"
                  :items-total="itemsTotal"
                  :page="page"
                  :possible-items-per-page="possibleItemsPerPage"
                  :search-term="searchTerm"
                  :sort-by="databasesTable.sortBy"
                  :sort-desc="sortDesc"
                  @clear-filters="searchTerm = ''"
                  @update:items-per-page="changePerPage"
                  @update:page="changePage"
                  @update:sort-by="changeSortBy"
                  @update:sort-desc="changeSortDesc"
                >
                  <template #no-data>
                    <ErrorCard
                      v-if="databasesTable.error !== null"
                      data-testid="databases-load-error"
                      :message="databasesTable.error"
                      retryable
                      @retry="reloadData()"
                    />

                    <EmptyState
                      v-else
                      data-testid="databases-empty"
                      :desc="t('message.emptyTable.databases.database.description')"
                      :title="t('message.emptyTable.databases.database.title')"
                    >
                      <template #image>
                        <HostingDatabasesIllustration />
                      </template>

                      <template #action>
                        <PageAddButton
                          :label="t('button.database.add')"
                          :loading="databasesTable.loading"
                          @click="onAddClick"
                        />
                      </template>
                    </EmptyState>
                  </template>

                  <template #actions="row">
                    <!-- Mobile: no Edit on the row (legacy mobile shows only the delete icon here). -->
                    <AppButton
                      v-if="row.can_rename && !mobile"
                      :aria-label="t('button.database.edit')"
                      data-testid="databases-row-edit"
                      kind="row-action"
                      :tooltip="t('button.database.edit')"
                      :tooltip-offset="4"
                      @click="showRenameDatabaseModal(slotRow(row))"
                    >
                      <v-icon icon="$edit2" />
                    </AppButton>

                    <AppButton
                      :aria-label="t('button.database.delete')"
                      data-testid="databases-row-delete"
                      kind="row-action"
                      :tooltip="t('button.database.delete')"
                      :tooltip-offset="4"
                      @click="showDeleteDatabaseModal(slotRow(row))"
                    >
                      <v-icon icon="$thrash" />
                    </AppButton>
                  </template>

                  <template #mobile="{ item, headers }">
                    <MobileTableField
                      :label="t('table.header.database')"
                      :value="item.database"
                      @sort="changeSortBy(headers[0]!)"
                    />

                    <MobileTableField
                      :label="t('table.header.size')"
                      :value="item.disk_usage"
                      @sort="changeSortBy(headers[1]!)"
                    />
                  </template>

                  <template #item.updated_at="{ item: row }">
                    <div class="d-flex">
                      <span>{{ row.updated_at_text }}</span>
                    </div>
                  </template>
                </DataTable>
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <v-window-item
        v-if="canManageMysql"
        :transition="false"
        :value="USERS"
      >
        <v-container :class="isProject ? 'mt-3 px-0 pt-7' : 'mt-3 px-0 py-3'">
          <v-row>
            <v-col cols="12">
              <div>
                <DataTable
                  :headers="usersTable.headers"
                  :item-class="userItemClass"
                  :item-slots="['databases', 'updated_at']"
                  :items="usersTable.items"
                  :items-loading="usersTable.loading"
                  :items-per-page="itemsPerPage as number"
                  :items-total="itemsTotal"
                  :page="page"
                  :possible-items-per-page="possibleItemsPerPage"
                  :search-term="searchTerm"
                  :sort-by="usersTable.sortBy"
                  :sort-desc="sortDesc"
                  @clear-filters="searchTerm = ''"
                  @update:items-per-page="changePerPage"
                  @update:page="changePage"
                  @update:sort-by="changeSortBy"
                  @update:sort-desc="changeSortDesc"
                >
                  <template #no-data>
                    <ErrorCard
                      v-if="usersTable.error !== null"
                      data-testid="users-load-error"
                      :message="usersTable.error"
                      retryable
                      @retry="reloadData()"
                    />

                    <EmptyState
                      v-else
                      data-testid="users-empty"
                      :desc="t('message.emptyTable.databases.users.description')"
                      :title="t('message.emptyTable.databases.users.title')"
                    >
                      <template #image>
                        <HostingDatabasesIllustration />
                      </template>

                      <template #action>
                        <PageAddButton
                          :label="t('button.user.add')"
                          :loading="usersTable.loading"
                          @click="onAddClick"
                        />
                      </template>
                    </EmptyState>
                  </template>

                  <template #item.databases="{ item: row }">
                    <div class="d-flex">
                      <ul>
                        <li
                          v-for="db in slotUserRow(row).databases"
                          :key="db.name"
                        >
                          <v-tooltip
                            location="bottom"
                            :model-value="db.showTooltip"
                            transition="custom-tooltip"
                            :z-index="99"
                            @update:model-value="toggleDatabaseTooltip(slotUserRow(row), db, $event)"
                          >
                            <template #activator="{ props: activatorProps }">
                              <AppButton
                                v-bind="activatorProps"
                                data-testid="users-row-database"
                                kind="text"
                                size="small"
                                @click="loadDbPrivilegesModal(slotUserRow(row), db)"
                              >
                                <v-icon icon="$database" />
                                {{ db.name }}
                              </AppButton>
                            </template>

                            <span>
                              {{ t('form.label.privileges') }}:
                              <Loader v-if="db.privileges === null" />

                              <ul v-else-if="db.privileges_preset !== CUSTOM_PRESET">
                                <li>
                                  <strong>- {{ presetLabel(db.privileges_preset) }}</strong>
                                </li>
                              </ul>

                              <ul v-else>
                                <li
                                  v-for="privilege in db.privileges"
                                  :key="privilege"
                                >
                                  <strong>- {{ privilege }}</strong>
                                </li>
                              </ul>
                            </span>
                          </v-tooltip>
                        </li>
                      </ul>
                    </div>
                  </template>

                  <template #actions="row">
                    <AppButton
                      v-if="usersMeta.privilegesSupported"
                      :aria-label="t('button.database.managePrivileges')"
                      data-testid="users-row-privileges"
                      kind="row-action"
                      :tooltip="t('button.database.managePrivileges')"
                      :tooltip-offset="4"
                      @click="loadUserPrivilegesModal(slotUserRow(row))"
                    >
                      <v-icon icon="$database" />
                    </AppButton>

                    <AppButton
                      :aria-label="t('button.user.edit')"
                      data-testid="users-row-edit"
                      kind="row-action"
                      :tooltip="t('button.user.edit')"
                      :tooltip-offset="4"
                      @click="showEditUserModal(slotUserRow(row))"
                    >
                      <v-icon icon="$edit2" />
                    </AppButton>

                    <AppButton
                      :aria-label="t('button.showAccessDetails')"
                      data-testid="users-row-info"
                      kind="row-action"
                      :tooltip="t('button.showAccessDetails')"
                      :tooltip-offset="4"
                      @click="loadInfoModal(slotUserRow(row))"
                    >
                      <v-icon
                        icon="$eye"
                        size="24"
                      />
                    </AppButton>

                    <AppButton
                      :aria-label="t('button.user.delete')"
                      data-testid="users-row-delete"
                      kind="row-action"
                      :tooltip="t('button.user.delete')"
                      :tooltip-offset="4"
                      @click="showDeleteUserModal(slotUserRow(row))"
                    >
                      <v-icon icon="$thrash" />
                    </AppButton>
                  </template>

                  <template #mobile="{ item, headers }">
                    <MobileTableField
                      :label="t('table.header.user')"
                      :value="item.user"
                      @sort="changeSortBy(headers[0]!)"
                    />
                  </template>

                  <template #item.updated_at="{ item: row }">
                    <div class="d-flex">
                      <span>{{ row.updated_at_text }}</span>
                    </div>
                  </template>
                </DataTable>
              </div>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <v-window-item
        v-if="canPhpmyadminSso"
        :transition="false"
        :value="PHPMYADMIN"
      >
        <v-container :class="isProject ? 'mt-3 px-0 pt-7' : 'mt-3 px-0 py-3'">
          <v-row>
            <v-col
              class="pb-2"
              cols="12"
            >
              <SettingCard
                data-testid="phpmyadmin-card"
                :description="t('heading.hosting.databases.phpmyadmin.subtitle')"
                :title="t('heading.hosting.databases.phpmyadmin.title')"
              >
                <template #alert>
                  <AlertSm
                    class="alert-sm--primary"
                    :text="t('heading.hosting.databases.phpmyadmin.alert')"
                  />
                </template>

                <template #action>
                  <AppButton
                    block
                    data-testid="phpmyadmin-login"
                    :href="'#'"
                    kind="setting-action"
                    :loading="phpmyadminSso.state.loading"
                    :target="'_blank'"
                    @click.prevent="onPhpmyadminLogin"
                  >
                    {{ t('button.login.phpmyadmin') }}
                  </AppButton>
                </template>
              </SettingCard>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>
    </v-window>

    <PhpMyAdminSsoDialogs :sso="phpmyadminSso" />

    <AppDialog
      v-model="modalOpen"
      overlay
      :persistent="modalBusy"
      transition="custom-dialog-transition"
    >

      <BasicModal
        v-if="modal"
        :key="modalRender"
        ref="basicModal"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        :confirm-required="modal.confirmRequired"
        :confirmed="Boolean(modalValues.confirm)"
        data-testid="databases-modal"
        :icon="modal.icon"
        :message="modalMessage"
        :submitting="modalBusy"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalClose"
      >
        <template
          v-if="modal.fields.length > 0"
          #default
        >
          <basic-modal-field
            v-for="(field, index) in modal.fields"
            :key="fieldName(field)"
            v-model="modalValues[fieldName(field)]"
            :field="field"
            :last="index === modal.fields.length - 1"
            @button-click="onFieldButtonClick"
            @change="onModalFieldChange(field, $event)"
          />
        </template>
      </BasicModal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { DatabaseModal, DatabaseModalKind } from './database-modals'
  import type { DatabaseRow, UserDatabase, UserRow } from './databases-table'
  import type { UserModal } from './user-modals'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { hasPrivilege, HOSTING_PRIVILEGES } from '@/views/hosting/hosting-privileges'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import PhpMyAdminSsoDialogs from '@/entities/sso/ui/PhpMyAdminSsoDialogs.vue'
  import { usePhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import HostingDatabasesIllustration from '@/shared/ui/illustrations/HostingDatabasesIllustration.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { initialFormValues } from '@/shared/ui/modal/initial-form-values'
  import { fieldName } from '@/shared/ui/modal/use-action-modal'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { buildAddDatabaseModal, buildDeleteDatabaseModal, buildRenameDatabaseModal } from './database-modals'
  import { DATABASE_HEADERS, databaseRowClass, toDatabaseRows, toUserRows, USER_HEADERS, userRowClass } from './databases-table'
  import { DATABASES, PHPMYADMIN, USERS } from './databases-tabs'
  import {
    createDatabase,
    createUser,
    deleteDatabase,
    deleteUser,
    getPrivileges,
    getServerInfo,
    listDatabases,
    listDatabasesCached,
    listUsers,
    renameDatabase,
    updatePrivileges,
    updateUser,
  } from './databases.api'
  import DatabasesTabs from './DatabasesTabs.vue'
  import {
    ALL_PRIVILEGES,
    allCheckboxValues,
    checkboxValues,
    CUSTOM_PRESET,
    determinePreset,
    MYSQL_PRIVILEGES,
    PRIVILEGE_PRESETS,
    privilegesFromForm,
  } from './mysql-privileges'
  import { buildDatabasePrivilegesModal, buildUserPrivilegesModal } from './privilege-modals'
  import {
    buildAddUserModal,
    buildDeleteUserModal,
    buildEditUserModal,
    buildUserInfoModal,
    revealPassword,
  } from './user-modals'

  // `project` is the frame of the project Advanced tab: the tabs sit in a second header row,
  // there is no account selector and the lists reload only for a new, truthy account id.
  const props = withDefaults(defineProps<{
    service: HostingService
    variant?: 'hosting' | 'project'
  }>(), {
    variant: 'hosting',
  })

  const isProject = computed(() => props.variant === 'project')

  interface TableState<T> {
    loading: boolean
    items: T[]
    search: string
    /** Message of the last failed list request of this tab; null when the last load worked (a failure is not an empty list). */
    error: string | null
    /** Per tab (the page, per-page, sort direction and search are shared). */
    sortBy: LegacySortHeader | false
    headers: LegacySortHeader[]
  }

  type ScreenModal = DatabaseModal | UserModal

  const { t } = useTranslation()
  const { mdAndDown, mobile } = useDisplay()
  const alerts = useAlertsStore()

  const canManageMysql = computed(() => hasPrivilege(props.service, HOSTING_PRIVILEGES.MANAGE_MYSQL))
  const canPhpmyadminSso = computed(() => hasPrivilege(props.service, HOSTING_PRIVILEGES.PHPMYADMIN_SSO))
  const selectedAccount = ref<HostingServerAccount | null>(props.service.server_accounts[0] ?? null)
  const showTabs = computed(() => selectedAccount.value !== null && !selectedAccount.value.diagnostic_mode)

  // The phpMyAdmin tab's login, with the server account's type and SSO host.
  const phpmyadminSso = usePhpMyAdminSso()

  function onPhpmyadminLogin (): void {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    void phpmyadminSso.login(account.id, account.server_type, account.details?.mysql_php_my_admin_sso_host)
  }

  // The first tab the user may see (legacy shows the first tab item, whatever its index).
  function initialTab (): number {
    if (canManageMysql.value) {
      return DATABASES
    }
    return canPhpmyadminSso.value ? PHPMYADMIN : DATABASES
  }
  const tab = ref<number>(initialTab())

  const databasesTable = reactive<TableState<DatabaseRow>>({
    loading: true,
    items: [],
    search: '',
    error: null,
    sortBy: false,
    headers: DATABASE_HEADERS,
  })
  const usersTable = reactive<TableState<UserRow>>({
    loading: true,
    items: [],
    search: '',
    error: null,
    sortBy: false,
    headers: USER_HEADERS,
  })
  // The phpMyAdmin tab has no list, so its state never gets rows.
  const phpmyadminTable = reactive<TableState<unknown>>({
    loading: false,
    items: [],
    search: '',
    error: null,
    sortBy: false,
    headers: [],
  })
  const current = computed(() => {
    if (tab.value === USERS) {
      return usersTable
    }
    return tab.value === DATABASES ? databasesTable : phpmyadminTable
  })

  // `privilegesSupported`, `requireDatabaseToCreateUser` and `renameSupported`: set from the last users answer, with legacy's defaults.
  const usersMeta = reactive({
    privilegesSupported: false,
    requireDatabaseToCreateUser: false,
    renameSupported: false,
  })

  // The table pages and sorts the loaded rows itself, so the page state never reloads.
  const noReload = (): undefined => undefined
  const {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortDesc,
    handleSearchTermChange,
  } = useDataIteratorPageState({
    load: noReload,
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortDesc: true,
  })

  const itemsTotal = computed(() => current.value.items.length)

  // A new sort goes back to page 1 and is stored on the current tab.
  function changeSortBy (value: LegacySortHeader): void {
    page.value = 1
    current.value.sortBy = value
  }

  // Set by a successful add, rename or edit. Legacy never clears them (its watcher reads a
  // field that does not exist).
  const highlightedDatabase = ref<string | undefined>(undefined)
  const highlightedUser = ref<string | undefined>(undefined)

  function databaseItemClass (item: Record<string, unknown>): string {
    return databaseRowClass(item, highlightedDatabase.value)
  }

  function userItemClass (item: Record<string, unknown>): string {
    return userRowClass(item, highlightedUser.value)
  }

  // The `#actions` slot types its row as a loose record, but it spreads a `DatabaseRow`, so the cast only names what the slot already carries.
  function slotRow (row: Record<string, unknown>): DatabaseRow {
    return row as unknown as DatabaseRow
  }

  // The same for the user rows (`#databases` and `#actions` slots).
  function slotUserRow (row: Record<string, unknown>): UserRow {
    return row as unknown as UserRow
  }

  // One `AppDialog` + `BasicModal` for every modal of the screen: the fields are rebuilt on every
  // open. `modalTarget` / `modalUserTarget` are the row a database or user action works on. `modalBusy` is `persistent` and
  // `submitting` set together.
  const basicModal = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('basicModal')
  const modal = ref<ScreenModal | null>(null)
  const modalTarget = ref<DatabaseRow | null>(null)
  const modalUserTarget = ref<UserRow | null>(null)
  // The database of the database privileges modal.
  const modalPrivilegeDatabase = ref('')
  const modalOpen = ref(false)
  const modalBusy = ref(false)
  let modalValidating = false
  // The account the open modal belongs to (set in `openModal`): a submit works on it even when the selector moved on meanwhile, and a
  // loader that waited for its data drops the modal when the account changed.
  const modalAccount = ref<HostingServerAccount | null>(null)
  const modalLoading = ref(false)
  const modalRender = ref(0)
  const modalValues = reactive<Record<string, unknown>>({})
  const modalMessage = computed(() => (modal.value && 'message' in modal.value ? modal.value.message : undefined))
  // The body scroll is locked while a modal is open.
  useBodyScrollLock(modalOpen)

  const DATABASE_SUCCESS_KEYS: Record<DatabaseModalKind, string> = {
    add: 'notification.hosting.databases.database.add.success',
    rename: 'notification.hosting.databases.database.rename.success',
    delete: 'notification.hosting.databases.database.delete.success',
  }

  const USER_SUCCESS_KEYS: Record<'add-user' | 'edit-user' | 'delete-user', string> = {
    'add-user': 'notification.hosting.databases.user.add.success',
    'edit-user': 'notification.hosting.databases.user.update.success',
    'delete-user': 'notification.hosting.databases.user.delete.success',
  }

  function accountPrefix (account: HostingServerAccount): string {
    return account.mysql_db_prefix ?? ''
  }

  function openModal (next: ScreenModal): void {
    modalRender.value++
    for (const key of Object.keys(modalValues)) {
      delete modalValues[key]
    }
    Object.assign(modalValues, initialFormValues(next.fields), next.values)
    modal.value = next
    modalAccount.value = selectedAccount.value
    modalOpen.value = true
  }

  function modalClose (): void {
    modalOpen.value = false
  }

  function onAddClick (): void {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    if (tab.value === DATABASES) {
      modalTarget.value = null
      openModal(buildAddDatabaseModal(accountPrefix(account), t))
    } else if (tab.value === USERS) {
      void loadAddUserModal(account)
    }
  }

  function showRenameDatabaseModal (row: DatabaseRow): void {
    const account = selectedAccount.value
    if (account) {
      modalTarget.value = row
      openModal(buildRenameDatabaseModal(accountPrefix(account), row, t))
    }
  }

  function showDeleteDatabaseModal (row: DatabaseRow): void {
    modalTarget.value = row
    openModal(buildDeleteDatabaseModal(t))
  }

  /** The rename field follows the backend's `rename_supported`. */
  function showEditUserModal (row: UserRow): void {
    const account = selectedAccount.value
    if (account) {
      modalUserTarget.value = row
      openModal(buildEditUserModal({
        prefix: accountPrefix(account),
        user: row,
        renameSupported: usersMeta.renameSupported,
      }, t))
    }
  }

  function showDeleteUserModal (row: UserRow): void {
    modalUserTarget.value = row
    openModal(buildDeleteUserModal(t))
  }

  /**
   * Runs one modal loader at a time (a second click while the data loads is ignored). `load` fetches what the modal needs and returns the
   * function that opens it; that runs only while the account is still the selected one. An error alerts and opens nothing.
   */
  async function loadModal (account: HostingServerAccount, load: () => Promise<() => void>): Promise<void> {
    if (modalLoading.value) {
      return
    }
    modalLoading.value = true
    try {
      const open = await load()
      if (selectedAccount.value?.id === account.id) {
        open()
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalLoading.value = false
    }
  }

  /** The host and port come from the cached server info. */
  async function loadInfoModal (row: UserRow): Promise<void> {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    await loadModal(account, async () => {
      const info = await getServerInfo(account.id)
      return () => openModal(buildUserInfoModal(row, info, t))
    })
  }

  /** The database list comes from the cache, then the modal opens. */
  async function loadAddUserModal (account: HostingServerAccount): Promise<void> {
    await loadModal(account, async () => {
      const databases = await listDatabasesCached(account.id)
      return () => {
        modalUserTarget.value = null
        openModal(buildAddUserModal({
          prefix: accountPrefix(account),
          databases,
          requireDatabase: usersMeta.requireDatabaseToCreateUser,
        }, t))
      }
    })
  }

  /** The "Set New Password" button of the edit user modal. */
  function onFieldButtonClick (): void {
    if (modal.value) {
      revealPassword(modal.value.fields)
    }
  }

  /** Validates the form and runs the action of the modal. Cancel closes the dialog. */
  async function onModalButton (id: string): Promise<void> {
    const active = modal.value
    if (!active) {
      return
    }
    if (id === 'cancel') {
      modalClose()
      return
    }
    // `modalBusy` is set only once the request starts, after the async validation: a quick second click would send it twice.
    if (modalBusy.value || modalValidating) {
      return
    }
    modalValidating = true
    let result: { valid: boolean } | undefined
    try {
      result = await basicModal.value?.validate()
    } finally {
      modalValidating = false
    }
    if (result && !result.valid) {
      return
    }
    await submitModal(active)
  }

  async function submitModal (active: ScreenModal): Promise<void> {
    switch (active.kind) {
      case 'add':
      case 'rename':
      case 'delete': {
        await submitDatabaseModal(active)
        return
      }
      case 'add-user':
      case 'edit-user':
      case 'delete-user': {
        await submitUserModal(active)
        return
      }
      case 'privileges-user':
      case 'privileges-database': {
        await submitPrivilegesModal(active)
        return
      }
      default: {
        // The Access details modal has no submit button.
        return
      }
    }
  }

  /**
   * The submit flow: `persistent` and `submitting` on for the request, then the success alert (the dialog closes) or the error
   * alert (the dialog stays open).
   */
  async function runModalRequest (request: () => Promise<void>, successKey: string, afterSuccess: () => void): Promise<void> {
    modalBusy.value = true
    try {
      await request()
      alerts.addAlert({ success: true, successMessage: t(successKey) })
      afterSuccess()
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalBusy.value = false
    }
  }

  /**
   * One request, then the success alert, the
   * highlight (add and rename only, as legacy), a reload and the closed dialog.
   */
  async function submitDatabaseModal (active: DatabaseModal): Promise<void> {
    const account = modalAccount.value
    const target = modalTarget.value
    if (!account || (active.kind !== 'add' && !target)) {
      return
    }
    const name = String(modalValues.name ?? '')
    const prefix = accountPrefix(account)
    await runModalRequest(async () => {
      if (active.kind === 'add') {
        await createDatabase(account.id, name)
      } else if (active.kind === 'rename' && target) {
        await renameDatabase(account.id, target.database, name)
      } else if (target) {
        await deleteDatabase(account.id, target.database)
      }
    }, DATABASE_SUCCESS_KEYS[active.kind], () => {
      if (active.kind === 'add' || active.kind === 'rename') {
        highlightedDatabase.value = prefix + name
      }
      void reloadDatabases(account)
    })
  }

  /**
   * The request carries the modal's values as in legacy. Add and edit highlight `prefix + name` and reload the users, delete only reloads.
   */
  async function submitUserModal (active: UserModal): Promise<void> {
    const account = modalAccount.value
    const target = modalUserTarget.value
    if (!account) {
      return
    }
    const prefix = accountPrefix(account)
    const form = { ...modalValues }
    const name = String(form.name ?? '')
    if (active.kind === 'add-user') {
      await runModalRequest(() => createUser(account.id, form), USER_SUCCESS_KEYS['add-user'], () => {
        highlightedUser.value = prefix + name
        void reloadUsers(account)
      })
    } else if (active.kind === 'edit-user' && target) {
      await runModalRequest(() => updateUser(account.id, target.user, form), USER_SUCCESS_KEYS['edit-user'], () => {
        highlightedUser.value = prefix + name
        void reloadUsers(account)
      })
    } else if (active.kind === 'delete-user' && target) {
      await runModalRequest(() => deleteUser(account.id, target.user), USER_SUCCESS_KEYS['delete-user'], () => {
        void reloadUsers(account)
      })
    }
  }

  /**
   * The privileges and their preset land on the database row, so the tooltip and the modals read the same data.
   */
  async function fetchDatabasePrivileges (accountId: number, user: UserRow, database: UserDatabase): Promise<void> {
    const privileges = await getPrivileges(accountId, user.user, database.name)
    database.privileges = privileges
    database.privileges_preset = determinePreset(privileges)
  }

  /** The label of a preset in the database tooltip. */
  function presetLabel (preset: string | undefined): string {
    const found = PRIVILEGE_PRESETS.find(item => item.value === preset)
    return found ? t(found.labelKey) : ''
  }

  /**
   * A database whose tooltip opens and whose privileges are not fetched
   * yet gets them. The cache makes a second request for the same database a no-op. The opening tooltip calls this directly instead of a
   * deep watch over every user, database and privilege, so a change elsewhere in the tree walks nothing.
   */
  function toggleDatabaseTooltip (user: UserRow, database: UserDatabase, open: boolean): void {
    database.showTooltip = open
    const account = selectedAccount.value
    if (!open || !account || database.privileges !== null) {
      return
    }
    fetchDatabasePrivileges(account.id, user, database).catch((error: unknown) => {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    })
  }

  /**
   * Every database of the user gets its privileges before the modal opens.
   * Legacy's spinner never showed, so it is not ported.
   */
  async function loadUserPrivilegesModal (row: UserRow): Promise<void> {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    await loadModal(account, async () => {
      await Promise.all(row.databases
        .filter(database => database.privileges === null)
        .map(database => fetchDatabasePrivileges(account.id, row, database)))
      return () => showUserPrivilegesModal(row)
    })
  }

  /** The account's databases feed the database select. */
  function showUserPrivilegesModal (row: UserRow): void {
    modalUserTarget.value = row
    modalPrivilegeDatabase.value = ''
    openModal(buildUserPrivilegesModal({
      user: row.user,
      databases: row.databases,
      accountDatabases: databasesTable.items.map(item => item.database),
    }, t))
  }

  /**
   * Unlike legacy, the fetched privileges land on the row before the modal
   * opens, so the modal never reads a missing list.
   */
  async function loadDbPrivilegesModal (row: UserRow, database: UserDatabase): Promise<void> {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    await loadModal(account, async () => {
      if (database.privileges === null) {
        await fetchDatabasePrivileges(account.id, row, database)
      }
      return () => showDbPrivilegesModal(row, database)
    })
  }

  function showDbPrivilegesModal (row: UserRow, database: UserDatabase): void {
    modalUserTarget.value = row
    modalPrivilegeDatabase.value = database.name
    openModal(buildDatabasePrivilegesModal({ database: database.name, privileges: database.privileges ?? [] }, t))
  }

  /** `hidden` is true for every preset but `custom`. */
  function setCheckboxesHidden (active: ScreenModal, hidden: boolean): void {
    for (const field of active.fields) {
      if (field.type === 'checkbox') {
        field.hidden = hidden
      }
    }
  }

  /**
   * The boxes and the preset follow the chosen database. A database
   * that is not in the user's list keeps the boxes and the preset becomes `none`.
   */
  function applyDatabaseSelection (active: ScreenModal, database: string): void {
    const row = modalUserTarget.value
    if (!row) {
      return
    }
    const selected = row.databases.find(item => item.name === database)
    if (selected) {
      Object.assign(modalValues, checkboxValues(selected.privileges ?? []))
    }
    const preset = selected?.privileges_preset ?? 'none'
    modalValues.privileges_preset = preset
    setCheckboxesHidden(active, preset !== CUSTOM_PRESET)
  }

  /**
   * The `onChange` handlers of the privileges modals: the database select loads its
   * preset and boxes, the preset select shows the boxes for `custom` only, `ALL PRIVILEGES` checks or clears every box, and an unchecked
   * privilege clears `ALL PRIVILEGES`. Only user changes reach here (legacy `setValue` did not fire `onChange`).
   */
  function onModalFieldChange (field: ModalField, value: unknown): void {
    const active = modal.value
    if (!active || (active.kind !== 'privileges-user' && active.kind !== 'privileges-database') || !('name' in field)) {
      return
    }
    const name = String(field.name)
    if (active.kind === 'privileges-user' && name === 'database') {
      applyDatabaseSelection(active, String(value))
    } else if (active.kind === 'privileges-user' && name === 'privileges_preset') {
      setCheckboxesHidden(active, String(value) !== CUSTOM_PRESET)
    } else if (name === ALL_PRIVILEGES) {
      Object.assign(modalValues, allCheckboxValues(Boolean(value)))
    } else if (!value && MYSQL_PRIVILEGES.includes(name)) {
      modalValues[ALL_PRIVILEGES] = false
    }
  }

  /**
   * The database modal submits as `custom` on its own database; the user modal takes
   * the database of its select. Success highlights the user, reloads the users and closes the dialog.
   */
  async function submitPrivilegesModal (active: UserModal): Promise<void> {
    const account = modalAccount.value
    const row = modalUserTarget.value
    if (!account || !row) {
      return
    }
    const form: Record<string, unknown> = active.kind === 'privileges-database'
      ? { ...modalValues, privileges_preset: CUSTOM_PRESET, database: modalPrivilegeDatabase.value }
      : { ...modalValues }
    const database = String(form.database ?? '')
    if (!database) {
      return
    }
    await runModalRequest(() => updatePrivileges(account.id, row.user, database, privilegesFromForm(form)), 'notification.hosting.databases.user.updatePrivilege.success', () => {
      highlightedUser.value = row.user
      void reloadUsers(account)
    })
  }

  const addText = computed(() => {
    if (tab.value === DATABASES) {
      return t('button.database.add')
    }
    return tab.value === USERS ? t('button.user.add') : ''
  })

  // Request tokens (not in legacy): an answer that is no longer the latest request, or belongs to an account that is no longer
  // selected, is dropped, so a slow answer of account A cannot overwrite the rows of account B or switch off B's spinner.
  let databasesRequest = 0
  let usersRequest = 0

  async function reloadDatabases (account: HostingServerAccount): Promise<void> {
    const request = ++databasesRequest
    const isCurrent = () => request === databasesRequest && selectedAccount.value?.id === account.id
    databasesTable.loading = true
    databasesTable.items = []
    try {
      const rows = toDatabaseRows(await listDatabases(account.id))
      if (isCurrent()) {
        databasesTable.error = null
        databasesTable.items = rows
      }
    } catch (error) {
      if (isCurrent()) {
        databasesTable.error = getErrorMessage(error)
        alerts.addAlert({ success: false, errorMessage: databasesTable.error })
      }
    } finally {
      if (isCurrent()) {
        databasesTable.loading = false
      }
    }
  }

  /** The list and the meta of the last answer (privileges, database and rename). */
  async function reloadUsers (account: HostingServerAccount): Promise<void> {
    const request = ++usersRequest
    const isCurrent = () => request === usersRequest && selectedAccount.value?.id === account.id
    usersTable.loading = true
    usersTable.items = []
    try {
      const response = await listUsers(account.id)
      if (isCurrent()) {
        usersTable.error = null
        usersTable.items = toUserRows(response)
        usersMeta.privilegesSupported = response.meta.privileges_supported
        usersMeta.requireDatabaseToCreateUser = response.meta.require_database_to_create
        usersMeta.renameSupported = response.meta.rename_supported
      }
    } catch (error) {
      if (isCurrent()) {
        usersTable.error = getErrorMessage(error)
        alerts.addAlert({ success: false, errorMessage: usersTable.error })
      }
    } finally {
      if (isCurrent()) {
        usersTable.loading = false
      }
    }
  }

  /** A diagnostic account gets the alert and no request. */
  function reloadData (): void {
    const account = selectedAccount.value
    if (!account) {
      return
    }
    if (account.diagnostic_mode) {
      alerts.addAlert({ success: false, errorMessage: t('message.hostingAccountInDiagnosticMode') })
      databasesTable.loading = false
      usersTable.loading = false
      phpmyadminTable.loading = false
      return
    }
    if (canManageMysql.value) {
      void reloadDatabases(account)
      void reloadUsers(account)
    }
  }

  watch(() => props.service, service => {
    selectedAccount.value = service.server_accounts[0] ?? null
  })
  // `project`: reload only for a new, truthy id; without an id there is no request and both tables stay in `loading`.
  watch(selectedAccount, (value, oldValue) => {
    if (value === oldValue) {
      return
    }
    if (isProject.value && !(value?.id && value.id !== oldValue?.id)) {
      return
    }
    reloadData()
  })

  onMounted(() => {
    if (!isProject.value || selectedAccount.value?.id) {
      reloadData()
    }
  })
</script>

<style lang="scss" scoped src="./DatabasesView.scss"></style>
