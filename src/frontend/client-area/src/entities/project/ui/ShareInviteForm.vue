<template>
  <div class="share-invite">
    <div
      class="share-invite__grid"
      :class="{ 'share-invite__grid--with-sso': showSso }"
      data-testid="share-invite-form"
    >
      <LabeledField
        class="share-invite__field share-invite__field--user"
        :label="t('form.label.user.choose')"
      >
        <v-combobox
          :aria-label="t('form.label.user.choose')"
          chips
          class="share-invite__combobox"
          :custom-filter="(_value, query, item) => suggestionMatches(item?.raw as InvitationSuggestion, query)"
          hide-details
          item-title="name"
          item-value="email"
          :items="suggestions"
          :loading="suggestionsLoading"
          :menu-icon="''"
          :menu-props="{
            offset: 8,
            contentClass: 'custom-dropdown-select custom-dropdown-select--autocomplete custom-dropdown-select--autocomplete-share',
          }"
          :model-value="users"
          multiple
          :placeholder="t('form.placeholder.email')"
          return-object
          :search="search"
          variant="outlined"
          @update:model-value="emit('update:users', $event)"
          @update:search="emit('update:search', $event)"
        >
          <template #selection="{ item }">
            <v-chip
              class="share-invite__chip"
              :class="{ 'share-invite__chip--error': !isEmailCorrect(item) }"
              size="small"
            >
              <span class="text-truncate">{{ chipLabel(item) }}</span>

              <v-icon
                v-ripple
                :aria-label="t('button.remove')"
                class="ml-1 share-invite__chip-remove"
                icon="$close"
                role="button"
                size="16"
                @click.stop="removeUser(item)"
              />
            </v-chip>
          </template>

          <template #append-inner>
            <v-icon
              icon="$chevrondown"
              size="16"
            />
          </template>

          <template #item="{ item, props: itemProps }">
            <v-list-item
              v-bind="itemProps"
              :title="undefined"
            >
              <div class="d-flex align-center">
                <v-avatar size="32px">
                  <v-img :src="avatarUrl(item.email, 32)" />
                </v-avatar>

                <div class="d-flex flex-column ml-3">
                  <p class="s p-2 mb-0 font-weight-bold text--gray-darken2">
                    {{ item.name }}
                  </p>

                  <p
                    v-if="item.name !== item.email"
                    class="p-3 mb-0 mt-1"
                  >
                    {{ item.email }}
                  </p>
                </div>
              </div>
            </v-list-item>
          </template>
        </v-combobox>
      </LabeledField>

      <LabeledField
        class="share-invite__field"
        :label="t('form.label.role')"
      >
        <select-dropdown
          :aria-label="t('form.label.role')"
          block
          data-testid="share-role"
          :item-text="'text'"
          :item-value="'key'"
          :items="roles"
          :model-value="role"
          :placeholder="t('form.placeholder.role')"
          @update:model-value="emit('role-change', ($event as { key: string }).key)"
        />
      </LabeledField>

      <LabeledField
        v-if="showSso"
        class="share-invite__field"
        :label="t('form.label.loginAs')"
      >
        <ShareLoginAsSelect
          :disabled="wordpressUsersLoading"
          :items="wordpressUserDropdownItems"
          :loading="wordpressUsersLoading"
          :model-value="wordpressUserId"
          @update:model-value="emit('update:wordpress-user-id', $event)"
        />
      </LabeledField>

      <div class="share-invite__field share-invite__field--action">
        <AppButton
          class="share-invite__button"
          data-testid="share-invite"
          kind="field"
          :loading="inviteLoading"
          size="large"
          @click="emit('invite')"
        >
          {{ inviteLabel }}
        </AppButton>
      </div>
    </div>

    <slot name="after" />
  </div>
</template>

<script lang="ts" setup>
  // The invite form of the share dialogs: addresses (suggestions and typed ones
  // as chips), role, "Log in as" for an SSO role, and the invite button. The legacy share dialog and the onboarding dialog
  // each had a copy (the onboarding one without "Log in as"); here it is one component, the
  // labels are `LabeledField`, and the grid follows the width of the card (container query), not of the window, so it stacks inside a
  // narrow dialog. The form keeps no state: the dialog owns the addresses, the role and what the invite sends.
  import type { ShareRole, WordpressUserDropdownItem } from './share-instance'
  import type { InvitationSuggestion } from '@/entities/project/share-instance.api'
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
  import { avatarUrl } from '@/shared/ui/user-avatar/avatar-url'
  import { isEmailCorrect, suggestionMatches } from './share-instance'
  import ShareLoginAsSelect from './ShareLoginAsSelect.vue'

  type InviteEntry = InvitationSuggestion | string

  const props = withDefaults(defineProps<{
    users: InviteEntry[]
    suggestions: InvitationSuggestion[]
    suggestionsLoading?: boolean
    search?: string
    roles: ShareRole[]
    role: string
    inviteLabel: string
    inviteLoading?: boolean
    showSso?: boolean
    wordpressUserDropdownItems?: WordpressUserDropdownItem[]
    wordpressUserId?: number | null
    wordpressUsersLoading?: boolean
  }>(), {
    suggestionsLoading: false,
    search: '',
    inviteLoading: false,
    showSso: false,
    wordpressUserDropdownItems: () => [],
    wordpressUserId: null,
    wordpressUsersLoading: false,
  })

  const emit = defineEmits<{
    'update:users': [users: InviteEntry[]]
    'update:search': [value: string]
    'update:wordpress-user-id': [value: number | null]
    'role-change': [role: string]
    'invite': []
  }>()

  const { t } = useTranslation()

  function chipLabel (entry: InviteEntry): string {
    return typeof entry === 'object' ? entry.name ?? entry.email : entry
  }

  /** An object chip is removed by name and e-mail, a typed string by value. */
  function removeUser (entry: InviteEntry): void {
    emit('update:users', props.users.filter(item => {
      if (typeof entry === 'object') {
        return !(typeof item === 'object' && item.name === entry.name && item.email === entry.email)
      }
      return item !== entry
    }))
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.share-invite {
  container-type: inline-size;
}

// One row in a wide card (the 720px dialog, the 724px onboarding card); with "Log in as" the address takes the first row.
.share-invite__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 168px auto;
  gap: 12px;
  align-items: end;

  &--with-sso {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;

    .share-invite__field--user {
      grid-column: 1 / -1;
    }
  }

  @container (max-width: 520px) {
    &,
    &.share-invite__grid--with-sso {
      grid-template-columns: minmax(0, 1fr);
    }

    .share-invite__field--user {
      grid-column: auto;
    }

    .share-invite__button {
      width: 100%;
    }
  }
}

.share-invite__field {
  min-width: 0;

  &--action {
    display: flex;
    align-items: flex-end;
  }
}

.share-invite__button {
  min-width: 120px;
  white-space: nowrap;
}

.share-invite__combobox {
  width: 100%;

  :deep(.v-field) {
    height: fit-content;
    max-height: unset;
  }

  :deep(.v-field__append-inner) {
    padding-left: 0;
  }

  :deep(.v-field__input) {
    min-height: unset;
    padding-top: 0;
    padding-bottom: 0;

    input {
      min-width: 126px;
      max-width: unset;
      max-height: unset;
      padding: 0;
    }
  }

  &.v-select--active-menu :deep(.v-field__append-inner .v-icon) {
    color: map.get(v.$primary, darken1);
    transform: rotate(180deg);
  }
}

// Chips of the addresses: outlined, red for an address that is not an e-mail.
.share-invite__chip.v-chip {
  height: 28px;
  padding: 4px;
  overflow: hidden;
  border: 1px solid var(--v-gray-lighten3);
  border-radius: 5px;
  background: transparent;
  color: var(--v-gray-darken2);
  font-size: v.$font-size-sm;
  font-weight: v.$font-weight-normal;
  line-height: v.$line-height-sm;

  .share-invite__chip-remove {
    color: var(--v-gray-darken1);
  }

  &.share-invite__chip--error {
    border-color: var(--v-error-base);
    color: var(--v-error-base);

    .share-invite__chip-remove {
      color: var(--v-error-base);
    }
  }
}
</style>
