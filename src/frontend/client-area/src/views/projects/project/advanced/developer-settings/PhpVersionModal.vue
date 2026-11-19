<template>
  <AppDialog
    v-model="open"
    transition="custom-dialog-transition"
  >
    <BasicModal
      :buttons="buttons"
      class="card-width-560"
      data-testid="php-version-modal"
      :submitting="submitting"
      :title="t('heading.instance.advanced.modal.phpVersion.title')"
      @button-click="onButton"
      @modal-close="open = false"
    >
      <template #custom>
        <p class="mb-4 p-2 p-3">
          {{ t('heading.instance.advanced.modal.phpVersion.field') }}
          <strong>{{ instance.domain }}</strong>
        </p>

        <v-form class="d-flex flex-column">
          <div class="d-flex flex-column">
            <div class="last-child">
              <v-select
                v-model="version"
                density="compact"
                hide-details="auto"
                item-title="label"
                item-value="value"
                :items="versions"
                menu-icon="$dropdown"
                return-object
                variant="outlined"
              />
            </div>
          </div>
        </v-form>
      </template>
    </BasicModal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // The select of the PHP versions, the PUT with the chosen value and the emit of the new version. The modal is not persistent, as
  // in legacy. The view owns the scroll locks: it holds the `open` ref. After a successful PUT the cached `php-version` of the domain is dropped.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { clearPhpVersionCache, type PhpVersion, updatePhpVersion } from './developer-settings.api'

  const props = defineProps<{
    instance: InstanceResource
    currentVersion: PhpVersion | null
    versions: PhpVersion[]
  }>()

  const emit = defineEmits<{
    'update:current-version': [version: PhpVersion | null]
  }>()

  const open = defineModel<boolean>('open', { default: false })

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const submitting = ref(false)
  const version = ref<PhpVersion | null>(null)

  // The card is the kit `BasicModal`. Its `submitting` hides the X, spins Save and ignores every click while the request
  // runs; Cancel is also shown disabled then, as before. Save stays disabled without a version.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.saveChanges'), color: 'primary', disabled: !version.value },
    { ...cancelButton(t), disabled: submitting.value },
  ])

  function onButton (id: string): void {
    if (id === 'submit') {
      void submit()
      return
    }
    open.value = false
  }

  // The select starts from the current version each time the modal opens.
  watch(open, isOpen => {
    if (isOpen) {
      version.value = props.currentVersion
    }
  })

  async function submit (): Promise<void> {
    const hostingId = props.instance.hostingId as number
    const domain = props.instance.domain ?? ''
    submitting.value = true
    try {
      await updatePhpVersion(hostingId, domain, version.value?.value)
      clearPhpVersionCache(hostingId, domain)
      emit('update:current-version', version.value)
      alerts.addAlert({ success: true, successMessage: t('notification.instance.settings.update') })
      open.value = false
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style
  lang="scss"
  scoped
  src="@/shared/ui/modal/BasicModal.scss"
/>
