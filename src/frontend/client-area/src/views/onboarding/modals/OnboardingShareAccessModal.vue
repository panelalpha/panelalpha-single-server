<template>
  <OnboardingDialog
    :animated="false"
    data-testid="onboarding-share-access-modal"
    :model-value="modelValue"
  >
    <OnboardingCard
      v-if="modelValue"
      :close-disabled="loading"
      :width="724"
      @close="closeModal"
    >
      <template v-if="theme?.screenshot_url">
        <v-img
          height="285px"
          position="top center"
          :src="theme.screenshot_url"
          width="100%"
        />

        <v-divider />
      </template>

      <template v-if="!isCustomPrivilegesMenuOpen">
        <v-card-title class="d-flex align-center">
          <v-icon
            color="primary"
            icon="$share2Icon"
            size="24"
          />

          <h6 class="ml-4 mb-0 font-weight-bold heading--text">
            {{ t('reseller.modal.inviteUsers') }}
          </h6>
        </v-card-title>

        <v-card-text>
          <ShareInviteForm
            v-model:search="userSuggestionsSearch"
            v-model:users="userList"
            class="mb-6"
            :invite-label="t('button.sendInvite')"
            :role="role"
            :roles="roles"
            :suggestions="userSuggestions"
            :suggestions-loading="userSuggestionsLoading"
            @invite="assignUsers"
            @role-change="newRoleChanged"
          />

          <h6 class="mb-3">
            {{ t('heading.instance.modal.sharedAccess.table.title') }}
          </h6>

          <ShareAccessTable
            :current-user-email="session.user?.email"
            :roles="roles"
            :rows="rows"
            @role-changed="roleChanged"
            @user-remove-access="unassignUser"
          />
        </v-card-text>
      </template>

      <share-custom-privileges
        v-else
        :custom-privileges-user="customPrivilegesUser"
        :single-server="isSingleServerActive()"
        @cancel="closeCustomPrivilegesMenu"
        @save="saveCustomPrivileges"
      />

      <template v-if="isImport">
        <OnboardingStepFooter
          :back-disabled="loading"
          :back-label="t('button.back')"
          :max-steps="maxSteps"
          :next-disabled="loading"
          :next-label="t('button.continue')"
          :step="3"
          @back="closeModal"
          @next="sharedAccessSet"
        />
      </template>

      <template v-else>
        <v-card-actions class="d-flex flex-column pb-4 px-10 pt-6">
          <AppButton
            block
            kind="primary"
            :loading="loading"
            size="x-large"
            @click="sharedAccessSet"
          >
            <template #loader>
              <v-progress-circular
                class="mr-2"
                indeterminate
                size="20"
                width="2"
              />

              <span>{{ loadingText ? t(loadingText) : t('button.domain.creating') }}</span>
            </template>

            <span>{{ t(actionKey) }}</span>

            <v-icon
              class="ml-2"
              icon="$arrowright"
              size="24"
            />
          </AppButton>

          <AppButton
            block
            class="mx-0 mt-2"
            :disabled="loading"
            kind="cancel"
            size="x-large"
            @click="onSecondaryClick"
          >
            <span class="p-1 font-weight-light text--gray-darken1">
              {{ ' ' + t(secondaryLabelKey) + ' ' }}
            </span>
          </AppButton>
        </v-card-actions>
      </template>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The invite table reuses the
  // share kit of the project entity (`ShareInviteForm`, `ShareAccessTable`, `ShareCustomPrivileges`, `share-instance.ts`). The invites stay local
  // until the flow goes on: the onboarding has no instance yet, so no request is sent here.
  import type { InstallationTypeKey, OnboardingService } from '@/views/onboarding/onboarding-service'
  import type { OnboardingTheme } from '@/views/onboarding/onboarding.api'
  import type { InvitationSuggestion } from '@/entities/project/share-instance.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { canChooseTheme, shareAccessActionLabelKey } from '@/views/onboarding/onboarding-steps'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { fetchInvitationSuggestions } from '@/entities/project/share-instance.api'
  import { shareTableRows } from '@/entities/project/ui/share-access-table'
  import { buildRoles, type ShareRole, type ShareUser } from '@/entities/project/ui/share-instance'
  import ShareAccessTable from '@/entities/project/ui/ShareAccessTable.vue'
  import ShareCustomPrivileges from '@/entities/project/ui/ShareCustomPrivileges.vue'
  import ShareInviteForm from '@/entities/project/ui/ShareInviteForm.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { isSingleServerActive } from '@/shared/api/resource-paths'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    service: OnboardingService | null
    services: OnboardingService[]
    theme?: OnboardingTheme | null
    /** The type of the flow (`wordpress` unless a deploy type was picked). */
    installationType?: InstallationTypeKey
    loading?: boolean
    loadingText?: string | null
    isImport?: boolean
    maxSteps?: number
  }>(), {
    theme: null,
    installationType: 'wordpress',
    loading: false,
    loadingText: null,
    isImport: false,
    maxSteps: 0,
  })

  const emit = defineEmits<{
    'shared-access-set': [users: ShareUser[]]
    'change-service-button-clicked': []
    'change-theme-button-clicked': []
    'remove-modal': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()

  const roles: ShareRole[] = buildRoles((key, options) => t(key, options))

  const isCustomPrivilegesMenuOpen = ref(false)
  const userList = ref<Array<InvitationSuggestion | string>>([])
  const userSuggestions = ref<InvitationSuggestion[]>([])
  let userSuggestionsFetched = false
  const userSuggestionsLoading = ref(false)
  const userSuggestionsSearch = ref('')
  // Default role, as in legacy.
  const role = ref('full_access')
  const customPrivileges = ref<string[]>([])
  const customPrivilegesUser = ref<Pick<ShareUser, 'customPrivileges'> & Partial<ShareUser> | null>(null)
  const assignedUsers = ref<ShareUser[]>([])

  // The signed-in user is the owner row (the project does not exist yet), then the one invited user.
  const rows = computed(() => shareTableRows({ name: session.user?.name, email: session.user?.email }, assignedUsers.value))

  // The suggestions load once per dialog, on the first search of the combobox.
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

  watch(userSuggestionsSearch, loadSuggestions)

  const actionKey = computed(() => shareAccessActionLabelKey(props.service ?? undefined, props.installationType))

  /** Footer: change service when there are several, else change theme (WordPress), else cancel. */
  const secondaryAction = computed<'change-service' | 'change-theme' | 'cancel'>(() => {
    if (props.services.length > 1) {
      return 'change-service'
    }
    if (canChooseTheme(props.service ?? undefined) && props.installationType === 'wordpress') {
      return 'change-theme'
    }
    return 'cancel'
  })

  const secondaryLabelKey = computed(() => {
    switch (secondaryAction.value) {
      case 'change-service': { return 'button.service.change'
      }
      case 'change-theme': { return 'button.theme.change'
      }
      default: { return 'button.cancel'
      }
    }
  })

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  function onSecondaryClick (): void {
    if (props.loading) {
      return
    }
    switch (secondaryAction.value) {
      case 'change-service': {
        emit('change-service-button-clicked')
        break
      }
      case 'change-theme': {
        emit('change-theme-button-clicked')
        break
      }
      default: {
        emit('remove-modal')
      }
    }
  }

  function sharedAccessSet (): void {
    emit('shared-access-set', [...assignedUsers.value])
  }

  /** Each typed or suggested address joins the list; a second user is refused with an alert. */
  function assignUsers (): void {
    for (const entry of userList.value) {
      const user = typeof entry === 'string' ? { name: entry, email: entry } : entry
      if (assignedUsers.value.some(item => item.email === user.email)) {
        continue
      }
      if (assignedUsers.value.length > 0) {
        // The raw copy is the key: the translation of the key is the text the user sees.
        alerts.addAlert({ success: false, errorMessage: t('Only one user can be initialy added.') })
        continue
      }
      assignedUsers.value.push({
        name: user.name ?? user.email,
        email: user.email,
        role: role.value,
        customPrivileges: [...customPrivileges.value],
        wordpress_user_id: null,
        invitationPending: false,
        invited_at_text: '',
        notification_sent_at_text: '',
        resend_available_at: null,
      })
    }
    userList.value = []
  }

  function unassignUser (user: ShareUser): void {
    assignedUsers.value = assignedUsers.value.filter(item => item.email !== user.email)
  }

  function newRoleChanged (key: string): void {
    role.value = key
    if (key === 'custom') {
      openCustomPrivilegesMenu()
    }
  }

  function roleChanged (item: ShareUser, newValue: string): void {
    item.role = newValue
    if (newValue === 'custom') {
      openCustomPrivilegesMenu(item)
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

  /** A new invite keeps the list for the next address; an assigned user was edited in place. */
  function saveCustomPrivileges (): void {
    if (customPrivilegesUser.value && !customPrivilegesUser.value.email) {
      customPrivileges.value = [...customPrivilegesUser.value.customPrivileges]
    }
    closeCustomPrivilegesMenu()
  }

  function closeCustomPrivilegesMenu (): void {
    isCustomPrivilegesMenuOpen.value = false
    customPrivilegesUser.value = null
  }
</script>
