<template>
  <AppDialog
    :model-value="modelValue"
    overlay
    persistent
    transition="custom-dialog-transition"
    @update:model-value="emit('update:model-value', $event)"
  >
    <BasicModal
      v-if="!isCustomPrivilegesMenuOpen"
      :buttons="buttons"
      class="share-instance-modal"
      close-testid="share-close"
      data-testid="share-modal"
      icon="$share2Icon"
      loading-mode="active"
      :submitting="saveChangesButtonLoading"
      :title="title"
      title-testid="share-title"
      @button-click="onButton"
      @modal-close="cancelChanges"
    >
      <template #custom>
        <ShareInviteForm
          v-model:search="userSuggestionsSearch"
          v-model:users="userList"
          v-model:wordpress-user-id="inviteWordpressUserId"
          :invite-label="t('button.sharedAccess.invite')"
          :invite-loading="sendInviteButtonLoading"
          :role="role"
          :roles="roles"
          :show-sso="inviteRoleHasSso"
          :suggestions="filteredUsers"
          :suggestions-loading="userSuggestionsLoading"
          :wordpress-user-dropdown-items="wordpressUserDropdownItems"
          :wordpress-users-loading="loadingWordpressUsers"
          @invite="sendInvite"
          @role-change="newRoleChanged"
        />

        <checkbox
          v-if="hasStagingsAny"
          v-model="applyChangesToStagings"
          class="share-instance-modal__stagings"
          :label="t('heading.instance.modal.sharedAccess.stagingQuestion')"
        />

        <h6 class="share-instance-modal__section-title heading--text">
          {{ t('heading.instance.modal.sharedAccess.table.title') }}
        </h6>

        <ShareAccessTable
          :current-user-email="currentUserEmail"
          :pending-emails="Object.keys(pendingChanges)"
          :resending="resending"
          :roles="roles"
          :rows="rows"
          :show-sso="shareAccessTableShowsSso"
          :sso-for="roleHasSsoForUser"
          :wordpress-user-dropdown-items="wordpressUserDropdownItems"
          @resend-button-clicked="resendInvite"
          @role-changed="roleChanged"
          @user-remove-access="unassignUser"
          @wordpress-user-changed="wordpressUserChanged"
        />
      </template>
    </BasicModal>

    <share-custom-privileges
      v-else
      :custom-privileges-user="customPrivilegesUser"
      :single-server="singleServer"
      @cancel="closeCustomPrivilegesMenu"
      @save="saveCustomPrivileges"
    />
  </AppDialog>
</template>

<script lang="ts" setup>
  // A single instance
  // (`instance`, from the share chip of a card or the kebab) or a selection (`multiInstances`, the mass Share action). The
  // dialog is `v-model`ed by the screen: legacy opened it through `$refs.shareInstanceModal.isOpen` and an activator slot.
  // The pure parts (merging users, the SSO rules, the requests) live in `share-instance.ts`.
  import type { ShareInstanceLike, ShareRole, ShareUser } from './share-instance'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { SharedAccessEntry } from '@/entities/project/instance-resource'
  import type { InvitationSuggestion, WordpressUser } from '@/entities/project/share-instance.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import {
    deleteSharedAccess,
    fetchInvitationSuggestions,
    fetchWordpressUsers,
    inviteSharedAccess,
    resendSharedAccessInvite,
    updateSharedAccess,
  } from '@/entities/project/share-instance.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { escapeHtml } from '@/shared/format/escape-html'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import { shareTableRows } from './share-access-table'
  import {
    ALL_WORDPRESS_USERS_KEY,
    assignedUsersOf,
    assignedUsersOfMany,
    buildInviteRequest,
    buildMultiSavePlan,
    buildRoles,
    buildSingleSaveRequests,
    buildWordpressUserDropdownItems,
    filterSuggestions,
    hasStagings,
    roleHasSso,
  } from './share-instance'
  import ShareAccessTable from './ShareAccessTable.vue'
  import ShareCustomPrivileges from './ShareCustomPrivileges.vue'
  import ShareInviteForm from './ShareInviteForm.vue'

  type SuggestionItem = InvitationSuggestion

  const props = withDefaults(defineProps<{
    modelValue?: boolean
    instance?: ShareInstanceLike
    multiInstances?: ShareInstanceLike[]
    // The host passes them, the kit does not read the session.
    currentUserEmail?: string
    singleServer?: boolean
  }>(), {
    modelValue: false,
    currentUserEmail: undefined,
    singleServer: false,
    instance: () => ({ id: 0, sharedAccess: [] }),
    multiInstances: () => [],
  })

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // Legacy `watch: isOpen` dispatched `lockBodyScroll` / `unlockBodyScroll`.
  useBodyScrollLock(computed(() => props.modelValue))

  const roles: ShareRole[] = buildRoles((key, options) => t(key, options))

  const isCustomPrivilegesMenuOpen = ref(false)
  const userList = ref<Array<SuggestionItem | string>>([])
  const userSuggestions = ref<InvitationSuggestion[]>([])
  let userSuggestionsFetched = false
  const userSuggestionsLoading = ref(false)
  const userSuggestionsSearch = ref('')
  const sendInviteButtonLoading = ref(false)
  const saveChangesButtonLoading = ref(false)
  const role = ref('view_only')
  const customPrivileges = ref<string[]>([])
  const pendingChanges = reactive<Record<string, ShareUser>>({})
  const pendingRemove = reactive<Record<string, ShareUser>>({})
  const customPrivilegesUser = ref<Pick<ShareUser, 'customPrivileges'> & Partial<ShareUser> | null>(null)
  let lastResponse: SharedAccessEntry[] = []
  const resending = ref<string[]>([])
  const applyChangesToStagings = ref(false)
  const wordpressUsers = ref<WordpressUser[]>([])
  const loadingWordpressUsers = ref(false)
  const inviteWordpressUserId = ref<number | null>(null)

  // Fresh objects per evaluation (a change of the shared access rebuilds them). They are made reactive
  // because the rows write the chosen role into them, as the Vue 2 rows did.
  const assignedUsers = computed(() => reactive(props.multiInstances.length > 0
    ? assignedUsersOfMany(props.multiInstances)
    : assignedUsersOf(props.instance)))

  const filteredUsers = computed(() => filterSuggestions(userSuggestions.value, assignedUsers.value))

  const hasStagingsAny = computed(() => hasStagings(props.instance, props.multiInstances))

  const hasPendingChanges = computed(() => Object.keys(pendingChanges).length > 0 || Object.keys(pendingRemove).length > 0)

  const inviteRoleHasSso = computed(() => roleHasSso(role.value, customPrivileges.value))

  const wordpressUserDropdownItems = computed(() => buildWordpressUserDropdownItems(wordpressUsers.value, (key, options) => t(key, options)))

  // The owner row only for one project (a selection of several has no common owner), then the users not marked for removal.
  const rows = computed(() => shareTableRows(props.multiInstances.length > 0 ? null : props.instance.owner, assignedUsers.value, pendingRemove))

  // `BasicModal` renders the title as HTML, so the project title is escaped before it goes into the copy.
  const title = computed(() => props.multiInstances.length > 0
    ? t('heading.instance.modal.sharedAccess.title.other', { length: props.multiInstances.length })
    : t('heading.instance.modal.sharedAccess.title.one', { title: escapeHtml(props.instance.title ?? '') }))

  const buttons = computed<ModalButton[]>(() => [
    {
      id: 'save',
      label: hasPendingChanges.value ? t('button.sharedAccess.pending') : t('button.save'),
      color: 'primary',
      loading: true,
      testId: 'share-save',
    },
    { ...cancelButton((key, options) => t(key, options)), testId: 'share-cancel' },
  ])

  function onButton (id: string): void {
    if (id === 'save') {
      void saveChanges()
    } else {
      cancelChanges()
    }
  }

  // The dialog stays `persistent` (a click beside it keeps the pending changes); Esc cancels like the X and Cancel. The dialog listens
  // on the window while it is open: V4 hands Esc only to the top overlay, and the selection bar of the mass Share is an overlay too.
  // Esc with a picker menu of the dialog open (`aria-expanded`, still true while the event runs) only closes the menu, as V4 does;
  // the custom privileges screen and a running save keep the dialog.
  function onEscape (event: KeyboardEvent): void {
    if (event.key !== 'Escape' || saveChangesButtonLoading.value || isCustomPrivilegesMenuOpen.value) {
      return
    }
    if (document.querySelector('[data-testid="share-modal"] [aria-expanded="true"]')) {
      return
    }
    cancelChanges()
  }

  watch(() => props.modelValue, open => {
    if (open) {
      window.addEventListener('keydown', onEscape)
    } else {
      window.removeEventListener('keydown', onEscape)
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onEscape)
  })

  const shareInstanceId = computed(() => props.multiInstances.length > 0 ? props.multiInstances[0]!.id : props.instance.id)

  const shareAccessTableShowsSso = computed(() => inviteRoleHasSso.value || assignedUsers.value.some(user => roleHasSsoForUser(user)))

  // The suggestions load once per dialog, when the combobox first renders (legacy: its `search-input` first changed on mount).
  function loadSuggestions (): void {
    if (userSuggestionsFetched) {
      return
    }
    userSuggestionsFetched = true
    userSuggestionsLoading.value = true
    fetchInvitationSuggestions()
      .then(items => {
        userSuggestions.value = items
      })
      .catch((error: unknown) => {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      })
      .finally(() => {
        userSuggestionsLoading.value = false
      })
  }

  watch(() => props.modelValue, open => {
    if (open) {
      void loadWordpressUsers()
      loadSuggestions()
    }
  })

  watch(userSuggestionsSearch, loadSuggestions)

  function roleHasSsoForUser (item: ShareUser): boolean {
    const pending = pendingChanges[item.email]
    const itemRole = pending?.role ?? item.role
    const privileges = pending?.customPrivileges ?? item.customPrivileges ?? []
    return roleHasSso(itemRole, privileges)
  }

  async function loadWordpressUsers (): Promise<void> {
    const instanceId = shareInstanceId.value
    if (!instanceId) {
      return
    }
    loadingWordpressUsers.value = true
    try {
      wordpressUsers.value = (await fetchWordpressUsers(instanceId)) || []
    } catch {
      wordpressUsers.value = []
    } finally {
      loadingWordpressUsers.value = false
    }
  }

  function wordpressUserChanged (item: ShareUser, wordpressUserId: number | null): void {
    item.wordpress_user_id = wordpressUserId == null || Number(wordpressUserId) === ALL_WORDPRESS_USERS_KEY
      ? null
      : Number(wordpressUserId)
    pendingChanges[item.email] = { ...item }
  }

  async function sendInvite (): Promise<void> {
    const request = buildInviteRequest({
      role: role.value,
      customPrivileges: customPrivileges.value,
      users: userList.value,
      applyToStagings: applyChangesToStagings.value,
      wordpressUserId: inviteWordpressUserId.value,
    })

    const targets = props.multiInstances.length > 0 ? props.multiInstances : [props.instance]
    const promises = targets.map(instance => sendInviteRequest(instance, request))

    sendInviteButtonLoading.value = true
    try {
      await Promise.all(promises)
      userList.value = []
      role.value = 'view_only'
      inviteWordpressUserId.value = null
      void nextTick(() => {
        emitAppEvent('instances-list-reload')
      })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      sendInviteButtonLoading.value = false
    }
  }

  async function sendInviteRequest (
    instance: ShareInstanceLike,
    request: Parameters<typeof inviteSharedAccess>[1],
    skipUpdate = false,
  ): Promise<SharedAccessEntry[]> {
    const data = await inviteSharedAccess(instance.id, request)
    lastResponse = data
    if (!skipUpdate) {
      applySharedAccessResponseToInstance(instance, data)
    }
    alerts.addAlert({ success: true, successMessage: t('notification.instance.sharedAccess.invite.success') })
    return data
  }

  function resendInvite (user: ShareUser): void {
    const request = { email: user.email, apply_to_stagings: applyChangesToStagings.value }

    const promises: Array<Promise<SharedAccessEntry[]>> = []
    if (props.multiInstances.length > 0) {
      for (const instance of props.multiInstances) {
        const emails = (instance.sharedAccess ?? []).map(access => access.email)
        if (!emails.includes(user.email)) {
          continue
        }
        promises.push(resendInviteRequest(instance, request))
      }
    } else {
      promises.push(resendInviteRequest(props.instance, request))
    }

    resending.value.push(user.email)
    Promise.all(promises)
      .catch((error: unknown) => {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      })
      .finally(() => {
        resending.value = resending.value.filter(email => email !== user.email)
      })
  }

  async function resendInviteRequest (
    instance: ShareInstanceLike,
    request: Parameters<typeof resendSharedAccessInvite>[1],
  ): Promise<SharedAccessEntry[]> {
    const data = await resendSharedAccessInvite(instance.id, request)
    lastResponse = data
    applySharedAccessResponseToInstance(instance, data)
    alerts.addAlert({
      success: true,
      successMessage: t('notification.instance.sharedAccess.resendInvite.success', { title: instance.title }),
    })
    return data
  }

  function roleChanged (item: ShareUser, newValue: string): void {
    item.role = newValue
    pendingChanges[item.email] = { ...item }
    if (newValue === 'custom') {
      openCustomPrivilegesMenu(item)
    }
  }

  function newRoleChanged (key: string): void {
    role.value = key
    if (!roleHasSso(key, customPrivileges.value)) {
      inviteWordpressUserId.value = null
    }
    if (key === 'custom') {
      openCustomPrivilegesMenu()
    }
  }

  function openCustomPrivilegesMenu (user: ShareUser | null = null): void {
    if (user) {
      customPrivilegesUser.value = user
    } else {
      customPrivileges.value = []
      customPrivilegesUser.value = { role: 'custom', customPrivileges: [] }
    }
    isCustomPrivilegesMenuOpen.value = true
  }

  function saveCustomPrivileges (): void {
    if (!customPrivilegesUser.value!.email) {
      customPrivileges.value = [...customPrivilegesUser.value!.customPrivileges]
      customPrivilegesUser.value = null
    }
    if (customPrivilegesUser.value) {
      pendingChanges[customPrivilegesUser.value.email!] = { ...customPrivilegesUser.value } as ShareUser
    }
    closeCustomPrivilegesMenu()
  }

  function closeCustomPrivilegesMenu (): void {
    isCustomPrivilegesMenuOpen.value = false
    customPrivilegesUser.value = null
  }

  function unassignUser (user: ShareUser): void {
    pendingRemove[user.email] = user
    if (pendingChanges[user.email]) {
      delete pendingChanges[user.email]
    }
  }

  function clearPending (): void {
    for (const email of Object.keys(pendingChanges)) {
      delete pendingChanges[email]
    }
    for (const email of Object.keys(pendingRemove)) {
      delete pendingRemove[email]
    }
  }

  function cancelChanges (): void {
    clearPending()
    role.value = 'view_only'
    userList.value = []
    emit('update:model-value', false)
  }

  /** The resource takes the new list and the screen is told (`instance-updated`). */
  function applySharedAccessResponseToInstance (instance: ShareInstanceLike, data: SharedAccessEntry[] | null | undefined = lastResponse): void {
    if (!instance || data == null) {
      return
    }
    const items = Array.isArray(data) ? data.slice() : []
    const resource = instance as ShareInstanceLike & { setSharedAccessData?: (items: SharedAccessEntry[]) => void }
    if (typeof resource.setSharedAccessData === 'function') {
      resource.setSharedAccessData(items)
      emitAppEvent('instance-updated', resource as unknown as Record<string, unknown>)
      return
    }
    instance.sharedAccess = items
    emitAppEvent('instance-updated', instance as unknown as Record<string, unknown>)
  }

  function finalizeSharedAccessSave (): void {
    clearPending()
    emit('update:model-value', false)
    void nextTick(() => {
      emitAppEvent('instances-list-reload')
    })
  }

  async function saveChanges (): Promise<void> {
    if (!hasPendingChanges.value) {
      cancelChanges()
      return
    }
    if (props.multiInstances.length > 0) {
      await multiInstancesSaveChanges()
      return
    }

    const { update, remove } = buildSingleSaveRequests(pendingChanges, pendingRemove, applyChangesToStagings.value)
    if (update.length === 0 && remove.length === 0) {
      return
    }

    saveChangesButtonLoading.value = true
    try {
      if (update.length > 0) {
        await updateRequest(props.instance, { users: update }, true)
      }
      if (remove.length > 0) {
        await deleteRequest(props.instance, { users: remove }, true)
      }
      applySharedAccessResponseToInstance(props.instance)
      finalizeSharedAccessSave()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      saveChangesButtonLoading.value = false
    }
  }

  async function multiInstancesSaveChanges (): Promise<void> {
    const plan = buildMultiSavePlan(props.multiInstances, pendingChanges, pendingRemove, applyChangesToStagings.value)
    if (plan.length === 0) {
      return
    }

    const promises = plan.map(async operation => {
      const instance = props.multiInstances.find(item => item.id === operation.instanceId)!
      let data: SharedAccessEntry[]
      if (operation.kind === 'invite') {
        data = await sendInviteRequest(instance, operation.request, true)
      } else if (operation.kind === 'update') {
        data = await updateRequest(instance, { users: operation.users }, true)
      } else {
        data = await deleteRequest(instance, { users: operation.users }, true)
      }
      applySharedAccessResponseToInstance(instance, data)
      return data
    })

    saveChangesButtonLoading.value = true
    try {
      await Promise.all(promises)
      finalizeSharedAccessSave()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      saveChangesButtonLoading.value = false
    }
  }

  async function updateRequest (
    instance: ShareInstanceLike,
    request: Parameters<typeof updateSharedAccess>[1],
    skipUpdate = false,
  ): Promise<SharedAccessEntry[]> {
    const data = await updateSharedAccess(instance.id, request)
    alerts.addAlert({
      success: true,
      successMessage: t('notification.instance.sharedAccess.update.success', { list: request.users.map(user => user.email).join(', ') }),
    })
    lastResponse = data
    if (!skipUpdate) {
      applySharedAccessResponseToInstance(instance, data)
    }
    return data
  }

  async function deleteRequest (
    instance: ShareInstanceLike,
    request: Parameters<typeof deleteSharedAccess>[1],
    skipUpdate = false,
  ): Promise<SharedAccessEntry[]> {
    const data = await deleteSharedAccess(instance.id, request)
    alerts.addAlert({
      success: true,
      successMessage: t('notification.instance.sharedAccess.delete.success', { list: request.users.map(user => user.email).join(', ') }),
    })
    lastResponse = data
    if (!skipUpdate) {
      applySharedAccessResponseToInstance(instance, data)
    }
    return data
  }
</script>

<style lang="scss" scoped>
.share-instance-modal__stagings {
  margin-top: 16px;
}

.share-instance-modal__section-title {
  margin: 24px 0 12px;
}
</style>
