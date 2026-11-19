<template>
  <BasicModal
    :buttons="buttons"
    data-testid="share-custom-privileges"
    icon="$settings"
    :title="t('heading.instance.modal.sharedAccess.privileges.title')"
    @button-click="onButton"
    @modal-close="emit('cancel')"
  >
    <template #custom>
      <v-expansion-panels
        class="share-privileges elevation-0"
        variant="accordion"
      >
        <v-expansion-panel
          v-for="group in groups"
          :key="'expansion-panel.' + group.key"
        >
          <v-expansion-panel-title class="align-start">
            <checkbox
              :indeterminate="groupIndeterminate(group.key)"
              :model-value="groupChecked(group.key)"
              @click.stop
              @update:model-value="toggleGroup(group.key)"
            />

            <div class="d-flex flex-column">
              <h6>
                {{ group.text }}
                <v-icon
                  class="ml-1 mb-1 chevron"
                  icon="$chevrondown"
                  size="16"
                />
              </h6>

              <span
                v-if="group.description"
                class="p-5 text-error"
              >{{ group.description }}</span>
            </div>
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <div
              v-for="item in groupPrivileges(group.key)"
              :key="item.key"
              class="d-flex flex-row align-center"
            >
              <checkbox
                v-if="customPrivilegesUser"
                :label="item.text"
                :model-value="customPrivilegesUser.customPrivileges.includes(item.key)"
                @update:model-value="togglePrivilege(item.key)"
              />
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>
  </BasicModal>
</template>

<script lang="ts" setup>
  // The custom privileges screen of the share
  // dialog. Like legacy it edits `customPrivilegesUser.customPrivileges` in place. The unused `instance` / `multiInstances` props and
  // `currentPrivileges` of legacy are not ported, nor is the `item.color` class no privilege sets.
  import type { ShareUser } from './share-instance'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { listPrivileges, listPrivilegesGroup } from '@/entities/privileges/list-privileges'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = defineProps<{
    customPrivilegesUser: Pick<ShareUser, 'customPrivileges'> | null
    // The host passes it, the kit does not read the session.
    singleServer?: boolean
  }>()

  const emit = defineEmits<{
    save: []
    cancel: []
  }>()

  const { t } = useTranslation()

  // The screen is a kit `BasicModal` (X and Cancel cancel, Save keeps the choice); legacy drew its own card and footer.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'save', label: t('button.save'), color: 'primary', testId: 'share-privileges-save' },
    { ...cancelButton(key => t(key)), testId: 'share-privileges-cancel' },
  ])

  function onButton (id: string): void {
    if (id === 'save') {
      emit('save')
    } else {
      emit('cancel')
    }
  }

  const privileges = computed(() => listPrivileges(key => t(key), props.singleServer))

  const groups = computed(() => listPrivilegesGroup(key => t(key)).filter(group => groupPrivileges(group.key).length > 0))

  function groupPrivileges (group: string) {
    return privileges.value.filter(privilege => privilege.group === group)
  }

  function selected (): string[] {
    return props.customPrivilegesUser!.customPrivileges
  }

  function groupChecked (group: string): boolean {
    return groupPrivileges(group).every(privilege => selected().includes(privilege.key))
  }

  function groupIndeterminate (group: string): boolean {
    if (groupChecked(group)) {
      return false
    }
    return groupPrivileges(group).some(privilege => selected().includes(privilege.key))
  }

  function checkPrivilege (key: string): void {
    if (!selected().includes(key)) {
      selected().push(key)
    }
  }

  function uncheckPrivilege (key: string): void {
    const index = selected().indexOf(key)
    if (index !== -1) {
      selected().splice(index, 1)
    }
  }

  function toggleGroup (group: string): void {
    const checked = groupChecked(group)
    for (const privilege of groupPrivileges(group)) {
      if (checked) {
        uncheckPrivilege(privilege.key)
      } else {
        checkPrivilege(privilege.key)
      }
    }
  }

  function togglePrivilege (key: string): void {
    if (!selected().includes(key)) {
      checkPrivilege(key)
      return
    }
    uncheckPrivilege(key)
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// Expansion panel rules (the privilege groups), moved here with the screen they style.
.share-privileges .v-expansion-panel {
  &:not(:last-child) {
    margin-bottom: 32px;
  }

  :deep(.v-expansion-panel-text__wrapper) {
    padding-bottom: 0;
    padding-top: 32px;

    > div:not(:last-child) {
      margin-bottom: 16px;
    }
  }

  :deep(.v-expansion-panel-text .checkbox) label {
    margin-left: 12px;
    color: var(--v-gray-darken2);
    font-size: v.$font-size-base;
    line-height: v.$line-height-base;
    font-weight: v.$font-weight-light;
  }

  :deep(.v-expansion-panel-title) {
    padding: 0;
    min-height: unset;
    background: transparent;

    .chevron {
      color: var(--v-gray-lighten1);
    }

    > *:not(.v-expansion-panel-title__icon) {
      flex: 0 1 auto;
    }
  }

  :deep(.v-expansion-panel-title__overlay) {
    opacity: 0;
  }

  :deep(.v-expansion-panel-title--active .chevron) {
    color: var(--v-primary-base);
    transform: rotate(180deg);
    transition: color 0.24s ease, transform 0.24s ease;
  }
}

.share-privileges .checkbox {
  margin-right: 12px;

  :deep(.v-selection-control) {
    min-height: unset;
  }
}
</style>
