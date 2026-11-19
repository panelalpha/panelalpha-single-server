<template>
  <div class="backup-settings">
    <v-row class="my-0">
      <v-col
        class="py-0"
        cols="12"
        sm="6"
      >
        <labeled-field :label="t('settings.backups.autoEnable')">
          <settings-select
            v-model="form.autoEnable"
            class="backup-auto-enable"
            :disabled="locked"
            :error-messages="serverErrors.auto_enable"
            hide-details="auto"
            :items="autoEnableItems"
            @update:model-value="clearError('auto_enable')"
          />
        </labeled-field>
      </v-col>

      <v-col
        class="py-0"
        cols="12"
        sm="6"
      >
        <labeled-field :label="t('settings.backups.keepLast')">
          <v-text-field
            class="v-input--md backup-keep-last"
            density="compact"
            :disabled="locked"
            :error-messages="serverErrors.keep_last"
            hide-details="auto"
            max="365"
            min="1"
            :model-value="form.keepLast ?? ''"
            :rules="keepLastRules"
            single-line
            type="number"
            variant="outlined"
            @update:model-value="onKeepLast"
          />
        </labeled-field>
      </v-col>
    </v-row>

    <v-row class="my-0 mt-4">
      <v-col
        class="py-0"
        cols="12"
        :sm="scheduleCols"
      >
        <labeled-field :label="t('settings.backups.frequency')">
          <settings-select
            v-model="form.frequency"
            class="backup-frequency"
            :disabled="locked"
            :error-messages="serverErrors.frequency"
            hide-details="auto"
            :items="frequencyItems"
            @update:model-value="clearError('frequency')"
          />
        </labeled-field>
      </v-col>

      <v-col
        v-if="form.frequency === 'weekly'"
        class="py-0"
        cols="12"
        :sm="scheduleCols"
      >
        <labeled-field :label="t('settings.backups.dayOfWeek')">
          <settings-select
            v-model="form.dayOfWeek"
            class="backup-day-of-week"
            :disabled="locked"
            :error-messages="serverErrors.day_of_week"
            hide-details="auto"
            :items="weekdayItems"
            @update:model-value="clearError('day_of_week')"
          />
        </labeled-field>
      </v-col>

      <v-col
        v-if="form.frequency === 'monthly'"
        class="py-0"
        cols="12"
        :sm="scheduleCols"
      >
        <labeled-field :label="t('settings.backups.dayOfMonth')">
          <settings-select
            v-model="form.dayOfMonth"
            class="backup-day-of-month"
            :disabled="locked"
            :error-messages="serverErrors.day_of_month"
            hide-details="auto"
            :items="monthDayItems"
            :rules="dayOfMonthRules"
            validate-on="eager"
            @update:model-value="clearError('day_of_month')"
          />
        </labeled-field>
      </v-col>

      <v-col
        class="py-0"
        cols="12"
        :sm="scheduleCols"
      >
        <labeled-field :label="t('settings.backups.hour')">
          <settings-select
            v-model="form.hour"
            class="backup-hour"
            :disabled="locked"
            :error-messages="serverErrors.hour"
            hide-details="auto"
            :items="hourItems"
            @update:model-value="clearError('hour')"
          />
        </labeled-field>
      </v-col>
    </v-row>

    <p
      v-if="!storeConfigured"
      class="backup-no-store-hint p-3 gray-text mt-4 mb-0"
      data-testid="backup-no-store-hint"
    >
      {{ t('settings.backups.noStoreHint', { defaultValue: 'Set up a backup store above to schedule backups for new projects.' }) }}
    </p>
  </div>
</template>

<script lang="ts" setup>
  import type { FreeBackupDefaults } from './free-backups.api'
  // The default schedule for new projects: its fields belong to the form of the
  // Settings page's Backups tab, which validates and saves them with its own button, through `payload()`.
  // It reports whether they differ from the stored ones with `changed`.
  import i18next from 'i18next'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import SettingsSelect from '@/shared/ui/form/SettingsSelect.vue'
  import {
    autoEnableOptions,
    type BackupDefaultsForm,
    frequencyOptions,
    hasField as hasFieldFor,
    hourOptions,
    isDefaultsChanged,
    isValidKeepLast,
    monthDayOptions,
    toLocalForm,
    toUtcPayload,
    type Translate,
    weekdayOptions,
  } from './backup-defaults'

  const props = withDefaults(defineProps<{
    // The stored (UTC) defaults from `GET /community/backups`.
    defaults: FreeBackupDefaults
    storeConfigured?: boolean
    disabled?: boolean
    // The 422 messages of the last save, by request key (`keep_last`, `day_of_month`, ...). A field shows its own and drops
    // them when its value changes; see `hasField` for the keys without one.
    errors?: Record<string, string[]>
  }>(), {
    storeConfigured: false,
    disabled: false,
    errors: () => ({}),
  })

  const emit = defineEmits<{
    changed: [changed: boolean]
  }>()

  const { t: translate } = useTranslation()
  const t = translate as Translate

  // Without a store the schedule has nothing to run against (the server skips new projects for good), so every field is off, not only
  // "Automatic backups" as in legacy.
  const locked = computed(() => !props.storeConfigured || props.disabled)

  // The stored (UTC) defaults, resent for the day fields of the other frequencies.
  const stored = ref<FreeBackupDefaults>({ ...props.defaults })
  const form = ref<BackupDefaultsForm>(toLocalForm(props.defaults))
  const serverErrors = ref<Record<string, string[]>>({ ...props.errors })

  // Three fields in the schedule line when the frequency has a day, two otherwise.
  const scheduleCols = computed(() => form.value.frequency === 'daily' ? 6 : 4)
  const autoEnableItems = computed(() => autoEnableOptions(t))
  const frequencyItems = computed(() => frequencyOptions(t))
  const weekdayItems = computed(() => weekdayOptions(i18next.language))
  const monthDayItems = computed(() => monthDayOptions(form.value.hour))
  const hourItems = hourOptions()

  const keepLastRules = [
    (value: unknown) => isValidKeepLast(value === '' ? null : Number(value)) || t('settings.backups.keepLastInvalid'),
  ]
  const dayOfMonthRules = [
    (value: unknown) => monthDayItems.value.some(item => item.value === value) || t('settings.backups.dayOfMonthRequired'),
  ]

  // V4 `v-text-field` has no `.number`: an empty input stays empty (invalid), anything else becomes a number.
  function onKeepLast (value: string | number | null) {
    form.value.keepLast = value === '' || value === null ? null : Number(value)
    clearError('keep_last')
  }

  function clearError (key: string) {
    if (serverErrors.value[key]) {
      const { [key]: _removed, ...rest } = serverErrors.value
      serverErrors.value = rest
    }
  }

  // The body of `PUT /community/backups`, in UTC.
  function payload () {
    return toUtcPayload(form.value, stored.value)
  }

  // Whether the field of a request key is on screen.
  function hasField (key: string) {
    return hasFieldFor(key, form.value.frequency)
  }

  const isChanged = computed(() => isDefaultsChanged(payload(), stored.value))

  watch(isChanged, changed => emit('changed', changed), { immediate: true })

  watch(() => props.errors, errors => {
    serverErrors.value = { ...errors }
  })

  watch(() => props.defaults, defaults => {
    stored.value = { ...defaults }
    form.value = toLocalForm(defaults)
  })

  defineExpose({ payload, hasField })
</script>

<style lang="scss" scoped>
// Legacy `.v-input--md` fields measured 40px (select) and 48px (number field) with no message: the V2 slot had no margin below
// it. The `outlined dense` model of `SettingsView.vue` (4px margin, -2px on the control: +2px) is for the General fields; with a
// message the V4 details row and the 8px / 4px field margin of that model stay as measured.
.backup-settings :deep(.v-input.v-input--md:not(:has(.v-messages__message)) .v-field) {
  margin-bottom: 0;
}

.backup-settings :deep(.v-input.v-input--md:not(:has(.v-messages__message)) .v-input__control) {
  margin-bottom: 0;
}
</style>
