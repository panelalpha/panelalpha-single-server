<template>
  <AppDialog
    :model-value="actions.open.value"
    overlay
    :persistent="actions.persistent.value"
    transition="custom-dialog-transition"
    @close="actions.close()"
  >
    <basic-modal
      v-if="actions.modal.value"
      :key="actions.render.value"
      ref="basic"
      :alert="actions.modal.value.alert"
      :buttons="actions.modal.value.buttons"
      class="card-width-560"
      :color="actions.modal.value.color"
      :confirm-required="actions.modal.value.confirmRequired"
      :confirmed="Boolean(actions.values.confirm)"
      data-testid="domains-modal"
      :icon="actions.modal.value.icon"
      :message="actions.modal.value.message"
      :submitting="actions.submitting.value"
      :title="actions.modal.value.title"
      @button-click="onButton"
      @modal-close="actions.close()"
    >
      <template #custom>
        <dns-options
          v-if="actions.showDnsOptions.value"
          v-bind="dnsOptionsProps"
          class="mb-4"
          data-testid="domains-modal-dns-options"
          :documentation-link="documentationLink"
          hide-title
        />
      </template>

      <template
        v-if="actions.fields.value.length > 0"
        #default
      >
        <basic-modal-field
          v-for="(field, index) in actions.fields.value"
          :key="index"
          :field="field"
          :last="index === actions.fields.value.length - 1"
          :model-value="fieldValue(field)"
          @blur="onFieldBlur(field)"
          @change="onFieldChange(field, $event)"
          @update:model-value="setFieldValue(field, $event)"
        />
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  // The `AppDialog`, which replaces the legacy `v-dialog`.
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { useDomainActions } from './use-domain-actions'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  import { computed, useTemplateRef } from 'vue'
  import { domainDnsOptionsInput } from '@/entities/domain/ui/dns-options'
  import DnsOptions from '@/entities/domain/ui/DnsOptions.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'

  const props = defineProps<{
    actions: ReturnType<typeof useDomainActions>
    service: HostingService
    serverAccount: HostingServerAccount
    documentationLink?: string
  }>()

  const basic = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('basic')

  // The same inputs `addDomain` checks (`hasDomainDnsInstructions`), so the step and the decision cannot drift.
  const dnsOptionsProps = computed(() => domainDnsOptionsInput(props.service, props.serverAccount, props.actions.dnsOptionsDomain.value))

  useBodyScrollLock(props.actions.open)

  // Legacy `BasicModal` kept one `formValues` bag keyed by field name; several fields share `domain`. A field reads and writes its own
  // keys of the bag: `name`, or `textName` + `selectName` for the text-select and `textName` for the domain input.
  function fieldValue (field: ModalField): unknown {
    const values = props.actions.values
    if (field.type === 'text-select') {
      return { [field.textName]: values[field.textName], [field.selectName]: values[field.selectName] }
    }
    if (field.type === 'domain-input') {
      return { [field.textName]: values[field.textName] }
    }
    return 'name' in field && field.name !== undefined ? values[field.name] : undefined
  }

  function setFieldValue (field: ModalField, value: unknown): void {
    const values = props.actions.values
    if (field.type === 'text-select' || field.type === 'domain-input') {
      Object.assign(values, value as Record<string, unknown>)
    } else if ('name' in field && field.name !== undefined) {
      values[field.name] = value
    }
  }

  function onFieldChange (field: ModalField, value: unknown): void {
    if (field.type === 'select' && field.name === 'type') {
      props.actions.onTypeChange(value)
    }
  }

  function onFieldBlur (field: ModalField): void {
    props.actions.onFieldBlur('name' in field ? field.name : undefined)
  }

  function onButton (id: string): void {
    void props.actions.onButton(id, async () => basic.value?.validate() ?? { valid: true })
  }
</script>
