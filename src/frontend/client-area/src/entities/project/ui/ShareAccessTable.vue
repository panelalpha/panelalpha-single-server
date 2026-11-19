<template>
  <DataTable
    :actions-sort="false"
    :card-below="SHARE_TABLE_CARD_BELOW"
    data-testid="share-table"
    header-testid="share-table-header"
    :headers="headers"
    hide-footer
    :item-slots="itemSlots"
    item-value="key"
    :items="(rows as unknown as Record<string, unknown>[])"
    :items-per-page="-1"
    :row-attrs="rowAttrs"
  >
    <template #no-data>
      <EmptyState
        :title="t('heading.instance.modal.sharedAccess.table.empty', { defaultValue: 'No one else has access yet.' })"
        variant="compact"
      />
    </template>

    <template #item.person="{ item }">
      <SharePersonCell
        :current-user-email="currentUserEmail"
        :email="asRow(item).email"
        :has-pending-changes="isPending(asRow(item))"
        :name="asRow(item).name"
        :resending="isResending(asRow(item))"
        :user="asRow(item).user"
        @resend="emit('resend-button-clicked', $event)"
      />
    </template>

    <template #item.role="{ item }">
      <ShareRoleSelect
        :owner="asRow(item).owner"
        :roles="roles"
        :user="asRow(item).user"
        @change="(user, role) => emit('role-changed', user, role)"
      />
    </template>

    <template #item.loginAs="{ item }">
      <ShareLoginAsSelect
        v-if="showsPicker(asRow(item))"
        :items="wordpressUserDropdownItems"
        :model-value="asRow(item).user!.wordpress_user_id"
        @update:model-value="emit('wordpress-user-changed', asRow(item).user!, $event)"
      />
    </template>

    <template #actions="{ row }">
      <AppButton
        v-if="!asRow(row).owner"
        :aria-label="t('tooltip.sharedAccess.removeAccess')"
        data-testid="share-remove-access"
        kind="row-action"
        :tooltip="t('tooltip.sharedAccess.removeAccess')"
        @click.stop="emit('user-remove-access', asRow(row).user!)"
      >
        <v-icon icon="$trash" />
      </AppButton>
    </template>

    <template #mobile="{ item }">
      <MobileTableField :label="headers[0]!.label as string">
        <SharePersonCell
          :current-user-email="currentUserEmail"
          :email="asRow(item).email"
          :has-pending-changes="isPending(asRow(item))"
          :name="asRow(item).name"
          :resending="isResending(asRow(item))"
          :user="asRow(item).user"
          @resend="emit('resend-button-clicked', $event)"
        />
      </MobileTableField>

      <MobileTableField :label="t('table.header.role')">
        <ShareRoleSelect
          :owner="asRow(item).owner"
          :roles="roles"
          :user="asRow(item).user"
          @change="(user, role) => emit('role-changed', user, role)"
        />
      </MobileTableField>

      <MobileTableField
        v-if="showsPicker(asRow(item))"
        :label="t('form.label.loginAs')"
      >
        <ShareLoginAsSelect
          :items="wordpressUserDropdownItems"
          :model-value="asRow(item).user!.wordpress_user_id"
          @update:model-value="emit('wordpress-user-changed', asRow(item).user!, $event)"
        />
      </MobileTableField>
    </template>

    <template #mobile-actions="{ row }">
      <AppButton
        v-if="!asRow(row).owner"
        :aria-label="t('tooltip.sharedAccess.removeAccess')"
        data-testid="share-remove-access"
        kind="row-action"
        :tooltip="t('tooltip.sharedAccess.removeAccess')"
        @click.stop="emit('user-remove-access', asRow(row).user!)"
      >
        <v-icon icon="$trash" />
      </AppButton>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  // The access table of the share dialogs: the kit `DataTable` with the owner
  // row and one row per user, the person, role and "Log in as" cells, and the mobile card below 768px. It replaces the hand-built grid
  // of the legacy share dialog, which at 375px spilled out
  // of the dialog and broke the counter header letter by letter. The rows and their pickers edit the users in place, as legacy did;
  // the dialog keeps the pending changes.
  import type { ShareTableRow } from './share-access-table'
  import type { ShareRole, ShareUser, WordpressUserDropdownItem } from './share-instance'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import { shareTableHeaders } from './share-access-table'
  import ShareLoginAsSelect from './ShareLoginAsSelect.vue'
  import SharePersonCell from './SharePersonCell.vue'
  import ShareRoleSelect from './ShareRoleSelect.vue'

  // The dialog card is 720px wide down to a 768px viewport; below it the columns no longer fit, so the rows become cards.
  const SHARE_TABLE_CARD_BELOW = 768

  const props = withDefaults(defineProps<{
    rows: ShareTableRow[]
    roles: ShareRole[]
    /** The "Log in as" column (a row or the invite has an SSO role); the onboarding step has none. */
    showSso?: boolean
    /** Whether a user row shows its "Log in as" picker (its role, or its pending role, has SSO). */
    ssoFor?: (user: ShareUser) => boolean
    wordpressUserDropdownItems?: WordpressUserDropdownItem[]
    currentUserEmail?: string
    /** Addresses with unsaved changes (the resend icon turns red, as legacy). */
    pendingEmails?: string[]
    /** Addresses whose invite is being resent. */
    resending?: string[]
  }>(), {
    showSso: false,
    ssoFor: () => false,
    wordpressUserDropdownItems: () => [],
    currentUserEmail: undefined,
    pendingEmails: () => [],
    resending: () => [],
  })

  const emit = defineEmits<{
    'role-changed': [user: ShareUser, role: string]
    'wordpress-user-changed': [user: ShareUser, wordpressUserId: number | null]
    'user-remove-access': [user: ShareUser]
    'resend-button-clicked': [user: ShareUser]
  }>()

  const { t } = useTranslation()

  const headers = computed(() => shareTableHeaders((key, options) => t(key, options), props.rows.length, props.showSso))
  const itemSlots = computed(() => props.showSso ? ['person', 'role', 'loginAs'] : ['person', 'role'])

  function asRow (item: unknown): ShareTableRow {
    return item as ShareTableRow
  }

  function rowAttrs (item: Record<string, unknown>): Record<string, string> {
    return { 'data-testid': asRow(item).owner ? 'share-owner-row' : 'share-user-row' }
  }

  function showsPicker (row: ShareTableRow): boolean {
    return props.showSso && !!row.user && props.ssoFor(row.user)
  }

  function isPending (row: ShareTableRow): boolean {
    return props.pendingEmails.includes(row.email) && !row.owner
  }

  function isResending (row: ShareTableRow): boolean {
    return props.resending.includes(row.email) && !row.owner
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Below the card threshold (768px, `SHARE_TABLE_CARD_BELOW`) the table holds one cell per row; a fixed layout keeps that cell at the
// width of the card (with the auto layout the min-content of a picker made the table 248px wide in a 199px card).
@media (max-width: #{map.get(v.$grid-breakpoints, sm) - 0.02px}) {
  :deep(.v-table__wrapper > table) {
    table-layout: fixed;
  }
}

// The pickers fill their cell and cut a long label (`All WordPress users`) with an ellipsis instead of widening the table: in the
// mobile card the nowrap label set the min-content width of the one cell, and the card spilled out of the 375px dialog.
:deep(.mobile-table-item__value),
:deep(.share-role),
:deep(.share-login-as),
:deep(.share-role__select) {
  min-width: 0;
  max-width: 100%;
}

:deep(.share-login-as .v-field__input),
:deep(.share-role__select .v-field__input) {
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

:deep(.share-login-as .select-dropdown__selection),
:deep(.share-role__select .select-dropdown__selection) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
