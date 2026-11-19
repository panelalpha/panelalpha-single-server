<template>
  <AppDialog
    :model-value="open"
    overlay
    :persistent="persistent"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @update:model-value="onDialogUpdate"
  >
    <basic-modal
      v-if="modal"
      :key="render"
      ref="modalRef"
      v-bind="modal.props"
      :buttons="buttons"
      :confirmed="confirmationComplete"
      data-testid="instances-modal"
      :style="{ width }"
      :submit-reason="choiceMissing ? modal.choice?.reason : undefined"
      :submitting="submitting"
      @button-click="onButtonClick"
      @modal-close="emit('close')"
    >
      <template
        v-if="modal.fields.length > 0"
        #default
      >
        <basic-modal-field
          v-for="(field, index) in modal.fields"
          :key="fieldName(field)"
          :field="field"
          :last="index === modal.fields.length - 1"
          :model-value="values[fieldName(field)]"
          @update:model-value="setField(field, $event)"
        />
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  // Host of the action modal dialog, now the kit `AppDialog`. Presentational: the state and the dispatch live in
  // `useActionModal` (`@/shared/ui/modal/use-action-modal`).
  import type { ActionModal } from '@/shared/ui/modal/action-modal'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  import { computed, useTemplateRef } from 'vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { fieldName } from '@/shared/ui/modal/use-action-modal'

  const props = withDefaults(defineProps<{
    modal: ActionModal | null
    open: boolean
    submitting?: boolean
    render?: number
    persistent?: boolean
    confirmed?: boolean
    width?: string
    values: Record<string, unknown>
  }>(), {
    submitting: false,
    render: 0,
    persistent: false,
    confirmed: false,
    width: undefined,
  })

  const emit = defineEmits<{
    'button': [id: string]
    'close': []
    // Only the changed field: the parent merges it, so two fields changed before a re-render keep both.
    'update:values': [patch: Record<string, unknown>]
  }>()

  // `v-dialog` closes on Esc or an outside click.
  function onDialogUpdate (value: boolean): void {
    if (!value) {
      emit('close')
    }
  }

  const modalRef = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalRef')

  // Every required checkbox of the dialog gates the buttons, not only `confirm`.
  const confirmationComplete = computed(() => props.confirmed === true
    && (props.modal?.fields ?? []).every(
      field => field.type !== 'checkbox' || field.required !== true || props.values[fieldName(field)] === true,
    ))

  // Nothing is sent until one of `modal.choice`'s checkboxes is ticked.
  const choiceMissing = computed(() => {
    const choice = props.modal?.choice
    return choice !== undefined && !choice.names.some(name => props.values[name] === true)
  })

  const buttons = computed(() => {
    const list = props.modal?.props.buttons ?? []
    return choiceMissing.value
      ? list.map(button => (button.type === 'cancel' ? button : { ...button, disabled: true }))
      : list
  })

  // The form is validated before the submit: a button other than cancel or close emits only when the fields
  // are valid. A modal without fields has nothing to validate, so its button is emitted at once, as before (the other dialogs keep their
  // timing; only a modal with fields waits for the validation).
  async function onButtonClick (id: string): Promise<void> {
    if (id === 'cancel' || id === 'close') {
      emit('button', id)
      return
    }
    if (choiceMissing.value) {
      return
    }
    if (props.modal?.fields.length === 0) {
      emit('button', id)
      return
    }
    const result = await modalRef.value?.validate()
    if (result && !result.valid) {
      return
    }
    emit('button', id)
  }

  function setField (field: ModalField, value: unknown): void {
    emit('update:values', { [fieldName(field)]: value })
  }
</script>
