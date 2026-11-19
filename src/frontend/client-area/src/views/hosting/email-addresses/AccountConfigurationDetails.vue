<template>
  <basic-modal
    icon="$eye"
    :title="t('heading.hosting.emailAddress.modal.show.title')"
    @modal-close="emit('modal-close')"
  >
    <template #custom>

      <div class="tabs">
        <v-tabs
          v-model="tab"
          slider-color="primary"
        >
          <v-tab :value="0">
            {{ t('heading.hosting.emailAddress.modal.show.tab.ssl') }}<br>({{ t('general.recommended') }})
          </v-tab>

          <v-tab :value="1">
            {{ t('heading.hosting.emailAddress.modal.show.tab.noSsl') }} <br>
            {{ t('general.settings') }}
          </v-tab>
        </v-tabs>
      </div>

      <v-tabs-window v-model="tab">
        <v-tabs-window-item :value="0">
          <ul class="details-list">
            <li>
              {{ t('heading.hosting.emailAddress.modal.show.username') }}: <span>{{ details.smtp_username }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.password.key') }}:
              <span>{{ t('heading.hosting.emailAddress.modal.show.password.value') }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.incomingServer') }}: <span>{{ details.inbox_host }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.imap') }}: <span>{{ details.imap_port }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.pop') }}: <span>{{ details.pop3_port }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.smtpHost') }}: <span>{{ details.smtp_host }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.smtpPort') }}: <span>{{ details.smtp_port }}</span>
            </li>
          </ul>
        </v-tabs-window-item>

        <v-tabs-window-item :value="1">
          <ul class="details-list">
            <li>
              {{ t('heading.hosting.emailAddress.modal.show.username') }}: <span>{{ details.smtp_username }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.password.key') }}:
              <span>{{ t('heading.hosting.emailAddress.modal.show.password.value') }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.incomingServer') }}: <span>{{ details.inbox_host }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.imap') }}: <span>{{ details.imap_insecure_port }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.pop') }}: <span>{{ details.pop3_insecure_port }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.smtpHost') }}: <span>{{ details.smtp_host }}</span>
            </li>

            <li>
              {{ t('heading.hosting.emailAddress.modal.show.smtpPort') }}: <span>{{ details.smtp_insecure_port }}</span>
            </li>
          </ul>
        </v-tabs-window-item>
      </v-tabs-window>
    </template>
  </basic-modal>
</template>

<script lang="ts" setup>
  // The dialog (560px, `$eye`) is owned by the page's `AppDialog` (card: kit `BasicModal`), as legacy's `email-details` type of `BasicModal`.
  // Kept here, not in `shared/ui`, because only the email addresses page uses it.
  import type { EmailAccountDetails } from './email-addresses.api'
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  defineProps<{
    details: EmailAccountDetails
  }>()

  const emit = defineEmits<{
    'modal-close': []
  }>()

  const { t } = useTranslation()
  // The SSL tab (Recommended) is the first one.
  const tab = ref<number>(0)
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.details-list {
  display: flex;
  flex-direction: column;
  margin-top: 32px;

  li {
    display: inline-flex;
    justify-content: space-between;
    color: var(--v-gray-lighten1);
    font-size: v.$font-size-sm;
    line-height: v.$line-height-sm;
    font-weight: v.$font-weight-semibold;

    &:not(:last-child) {
      margin-bottom: 8px;
    }

    span {
      color: var(--v-text-darken2);
      width: 50%;
    }
  }
}

.tabs {
  padding: 0;
  border-bottom: 1px solid var(--v-gray-lighten3);

  .v-tabs {
    max-height: 72px;
    height: 72px;

    .v-tab.v-btn {
      max-height: 72px;
      height: 72px;
      text-align: left;
      font-weight: v.$font-weight-bold;
      // Legacy `.v-tab` / `.v-tab--active` use `!important`, and so does the global
      // `_tabs.scss`; without it the global colour wins. The colour is not set by the `color` prop (that adds a `text-primary` class
      // with `!important`).
      color: var(--v-gray-lighten1) !important;
      font-size: v.$font-size-xlg;

      &.v-tab--selected {
        color: var(--v-text-darken2) !important;
      }
    }
  }
}
</style>
