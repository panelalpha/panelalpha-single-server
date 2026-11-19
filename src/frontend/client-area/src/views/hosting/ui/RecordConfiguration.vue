<template>
  <basic-modal
    :buttons="buttons"
    class="record-configuration-modal"
    icon="$settings"
    :title="t('heading.hosting.emailAddress.modal.show.spfdkimConfig')"
    @button-click="emit('close')"
    @modal-close="emit('close')"
  >
    <template #custom>
      <div
        v-for="section in sections"
        :key="section.key"
        class="record-box"
        :class="section.key === 'dkim' ? 'mt-8' : ''"
      >
        <h5 class="record-box-title">
          <span>{{ section.title }}</span>

          <StatusLabel
            v-if="!section.configured"
            class="record-label failed ms-3"
            status="error"
            :value="t('heading.hosting.emailAddress.emailDomain.record.failed')"
          />

          <StatusLabel
            v-else
            class="record-label configured ms-3"
            status="primary"
            :value="t('heading.hosting.emailAddress.emailDomain.record.configured')"
          />
        </h5>

        <p class="record-box-desc p-d">
          {{ section.description }}
        </p>

        <div
          v-if="section.records.length === 0"
          class="well well--gray py-3 px-4 mb-2"
        >
          {{ t('message.emptyTable.noRecords') }}
        </div>

        <template v-else>
          <div
            v-for="(record, index) in section.records"
            :key="index"
            class="well well--gray py-3 px-4 mb-2"
          >
            <ul class="record-box-list">
              <copy-record-item
                v-for="[name, value] in Object.entries(record)"
                :key="`${section.key}-${index}-${name}`"
                :label="t(`general.${name}`)"
                location="top"
                :value="String(value)"
              />
            </ul>
          </div>
        </template>
      </div>
    </template>
  </basic-modal>
</template>

<script lang="ts" setup>
  // Opened by the
  // records chip of the email domain selector (`EmailDomainSelector.vue`) on the Email Addresses and Forwarders screens. The screen
  // owns the `AppDialog` around it (no body scroll lock, as legacy); the card is the kit `BasicModal`.
  import type { DnsRecord } from './hosting.types'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import CopyRecordItem from '@/shared/ui/record-box/CopyRecordItem.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  const props = withDefaults(defineProps<{
    spfRecords?: DnsRecord[]
    dkimRecords?: DnsRecord[]
    spfConfigured?: boolean
    dkimConfigured?: boolean
  }>(), {
    spfRecords: () => [],
    dkimRecords: () => [],
    spfConfigured: false,
    dkimConfigured: false,
  })

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()

  // The only footer button is Cancel (legacy outlined Cancel; the kit card draws it as the plain text button of every modal).
  const buttons = computed<ModalButton[]>(() => [cancelButton(t)])

  const sections = computed(() => [
    {
      key: 'spf',
      title: t('heading.hosting.emailAddress.emailDomain.record.spf'),
      description: t('heading.hosting.emailAddress.modal.show.allowEmail'),
      records: props.spfRecords,
      configured: props.spfConfigured,
    },
    {
      key: 'dkim',
      title: t('heading.hosting.emailAddress.emailDomain.record.dkim'),
      description: t('heading.hosting.emailAddress.modal.show.digitalSignature'),
      records: props.dkimRecords,
      configured: props.dkimConfigured,
    },
  ])

  // The copy rows are `CopyRecordItem`: each row has its own hover and clipboard state (legacy had one for the whole modal, but only
  // the row under the cursor shows a tooltip).
</script>

<style lang="scss" scoped>
.record-box {
  &-title {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: var(--v-text-darken2);
    font-size: 18px;
    line-height: 24px;
  }
}
</style>
