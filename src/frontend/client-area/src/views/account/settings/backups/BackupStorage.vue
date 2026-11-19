<template>
  <div class="backup-storage">
    <!-- The same two columns as the loaded row, so nothing moves when the store arrives. -->
    <v-row
      v-if="loading"
      class="my-0 align-center"
    >
      <v-col
        class="py-0"
        cols="12"
        sm="6"
      >
        <v-skeleton-loader
          class="backup-skeleton__summary"
          type="text"
        />
      </v-col>

      <v-col
        class="py-0"
        :class="xs ? 'mt-4' : ''"
        cols="12"
        sm="6"
      >
        <v-skeleton-loader
          class="backup-skeleton__button"
          type="image"
        />
      </v-col>
    </v-row>

    <!-- The store is unknown, not missing: say so and let the owner try again. -->
    <error-card
      v-else-if="!loaded"
      class="backup-error mb-0"
      :message="errors.join(' ')"
    >
      <template #action>
        <AppButton
          class="backup-retry"
          kind="field"
          type="button"
          @click="emit('retry')"
        >
          <!-- Vue 2 kept a space either side of the label and the content is `white-space: break-spaces` (+6px). -->
          {{ ` ${t('button.retry')} ` }}
        </AppButton>
      </template>
    </error-card>

    <template v-else>
      <!-- The same two columns as the URL and Hub sections, so the button matches theirs. -->
      <v-row class="my-0 align-center">
        <v-col
          class="py-0"
          cols="12"
          sm="6"
        >
          <div class="backup-store-summary d-flex align-center">
            <template v-if="store">
              <v-icon
                class="backup-store-icon mr-2"
                :icon="driverIcon(store.driver)"
                size="20"
              />

              <span class="backup-store-driver p-2 font-weight-600 text-no-wrap">{{ t(`settings.backups.drivers.${store.driver}`) }}</span>

              <span class="p-2 text-gray-darken-1 mx-2">·</span>

              <span
                class="backup-store-location p-2 text-truncate"
                :title="store.location"
              >
                {{ store.location }}
              </span>
            </template>

            <span
              v-else
              class="backup-no-store p-2 font-weight-600"
            >{{ t('settings.backups.noStore') }}</span>
          </div>
        </v-col>

        <v-col
          class="py-0"
          :class="xs ? 'mt-4' : ''"
          cols="12"
          sm="6"
        >
          <AppButton
            block
            class="backup-store-button"
            kind="field"
            size="large"
            type="button"
            @click="modalOpen = true"
          >
            {{ store ? t('settings.backups.changeStore') : t('settings.backups.configureStore') }}
          </AppButton>

          <!-- Only a store the owner chose can be removed: the Engine's own store is not a choice. -->
          <AppButton
            v-if="store && storeSelected"
            block
            class="backup-store-remove mt-2"
            color="error"
            kind="secondary"
            size="large"
            type="button"
            @click="removeModalOpen = true"
          >
            {{ t('settings.backups.removeStore') }}
          </AppButton>
        </v-col>
      </v-row>
    </template>

    <backup-store-modal
      v-model="modalOpen"
      :current-store="store"
      :default-local-location="defaultLocalLocation"
      :drivers="drivers"
      @saved="data => emit('saved', data)"
    />

    <backup-store-remove-modal
      v-model="removeModalOpen"
      :store-created="storeCreated"
      @removed="data => emit('removed', data)"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { FreeBackups, FreeBackupStore } from './free-backups.api'
  // The Engine returns a store's driver and location only
  // (host, region and endpoint stay in its credentials), so those two are what the owner sees.
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import { driverIcon } from './backup-drivers'
  import BackupStoreModal from './BackupStoreModal.vue'
  import BackupStoreRemoveModal from './BackupStoreRemoveModal.vue'

  withDefaults(defineProps<{
    loading?: boolean
    // False once the load failed: the store is then unknown, so the row gives way to `errors` and Retry
    // (`retry` event). "No backup store configured" is only for a loaded `store: null`.
    loaded?: boolean
    errors?: string[]
    store?: FreeBackupStore | null
    // The owner chose this store in the panel; only such a one can be removed.
    storeSelected?: boolean
    // The panel made the store's Engine container.
    storeCreated?: boolean
    drivers: string[]
    defaultLocalLocation: string
  }>(), {
    loading: false,
    loaded: true,
    errors: () => [],
    store: null,
    storeSelected: false,
    storeCreated: false,
  })

  const emit = defineEmits<{
    retry: []
    saved: [data: Pick<FreeBackups, 'store' | 'store_selected' | 'store_created'>]
    removed: [data: FreeBackups]
  }>()

  const { t } = useTranslation()
  const { xs } = useDisplay()
  // Whether the modals are open; exposed for the tests.
  const modalOpen = ref(false)
  const removeModalOpen = ref(false)

  defineExpose({ modalOpen, removeModalOpen })
</script>

<style lang="scss" scoped>
// Skeletons the size of the summary line and of the large button.
.backup-skeleton {
  // V2 skeleton roots were transparent here (V4 paints the surface colour behind the bones).
  &__summary,
  &__button {
    background: transparent;
  }

  &__summary :deep(.v-skeleton-loader__text) {
    height: 12px;
    margin: 6px 0;
    max-width: 60%;
  }

  &__button :deep(.v-skeleton-loader__image) {
    height: 48px;
  }
}

// A long location truncates instead of widening its column.
.backup-store-summary {
  min-width: 0;
}
</style>
