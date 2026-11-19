<template>
  <div>
    <PhpMyAdminSsoModal
      v-model="state.ssoModal.opened"
      :databases="state.ssoModal.databases"
      :dns-mismatch-detected="state.ssoModal.dnsMismatchDetected"
      :hosting-account-id="state.ssoModal.hostingAccountId"
      :server-type="state.ssoModal.serverType"
    />

    <v-dialog
      v-model="state.chooseDatabase.opened"
      :persistent="submitting"
      transition="custom-dialog-transition"
    >
      <div
        class="card-overlay"
        @click="!submitting && closeChooseDatabase()"
      />

      <BasicModal
        :buttons="chooseButtons"
        class="card-width-560"
        color="info"
        data-testid="phpmyadmin-choose-database"
        :submitting="submitting"
        :title="chooseTitle"
        @button-click="onChooseButton"
        @modal-close="closeChooseDatabase"
      >
        <template #default>
          <BasicModalField
            v-model="selectedDatabase"
            :field="chooseField"
            :last="true"
          />
        </template>
      </BasicModal>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import type { ModalSelectField } from '@/shared/ui/modal/basic-modal.types'
  // The choose-database modal and the phpMyAdmin SSO modal: one host
  // embeds this component, and both dialogs read the state of `usePhpMyAdminSso`. The title `PHPMyAdmin` is the product name, as in legacy.
  import type { PhpMyAdminSso } from '@/entities/sso/use-phpmyadmin-sso'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import PhpMyAdminSsoModal from './PhpMyAdminSsoModal.vue'

  const props = defineProps<{
    sso: PhpMyAdminSso
  }>()

  const { t } = useTranslation()
  const state = props.sso.state

  const submitting = ref(false)
  const selectedDatabase = ref<number | undefined>(undefined)

  const chooseTitle = 'PHPMyAdmin'

  const chooseField = computed<ModalSelectField>(() => ({
    type: 'select',
    name: 'database',
    label: t('form.label.database'),
    options: state.chooseDatabase.databases.map(db => ({ label: db.label, value: db.value })),
  }))

  const chooseButtons = computed<ModalButton[]>(() => [
    { id: 'login', label: t('button.login.phpmyadmin'), color: 'primary' },
    { id: 'cancel', label: t('button.cancel'), type: 'cancel', color: 'normal', customClass: 'cancel-btn' },
  ])

  // The first database is selected each time the dialog opens.
  watch(() => state.chooseDatabase.databases, databases => {
    selectedDatabase.value = databases[0]?.value
  })

  function closeChooseDatabase (): void {
    props.sso.closeChooseDatabase()
  }

  async function onChooseButton (id: string): Promise<void> {
    if (id === 'cancel') {
      closeChooseDatabase()
      return
    }
    const accountId = state.chooseDatabase.hostingAccountId
    if (id !== 'login' || accountId === null) {
      return
    }
    submitting.value = true
    try {
      await props.sso.loginToDatabase(accountId, selectedDatabase.value)
    } finally {
      submitting.value = false
      closeChooseDatabase()
    }
  }
</script>
