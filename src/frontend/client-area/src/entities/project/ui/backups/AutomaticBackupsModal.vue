<template>
  <v-card
    class="basic-modal"
    data-testid="automatic-backups-modal"
    elevation="8"
  >
    <v-card-title class="d-flex flex-wrap align-center justify-space-between">
      <h5>
        <v-icon
          class="mr-4"
          color="primary"
          icon="$restorebackup"
          size="24"
        />

        {{ t('heading.instance.automaticBackup.title') }}
      </h5>

      <ModalCloseButton
        v-if="!submitting"
        @click="emit('modal-close')"
      />
    </v-card-title>

    <v-card-text>
      <div>
        <v-form class="d-flex flex-column">
          <div class="d-flex flex-column mb-6">
            <label
              id="automatic-backups-frequency-label"
              class="base--text mb-2 p-2 font-weight-600"
            >
              {{ t('form.label.howOften') }}
              <FormHelpIcon :text="t('tooltip.automatic_backup.frequency')" />
            </label>

            <div
              aria-labelledby="automatic-backups-frequency-label"
              class="d-flex checkbox-row"
              role="radiogroup"
            >
              <CheckboxBig
                :checked="data.frequency === 'daily' || data.frequency === 'never'"
                name="automatic-backups-frequency"
                :title="t('form.option.frequency.daily')"
                value="daily"
                @check="data.frequency = 'daily'"
              >
                <DailyBackupIllustration />
              </CheckboxBig>

              <CheckboxBig
                :checked="data.frequency === 'weekly'"
                name="automatic-backups-frequency"
                :title="t('form.option.frequency.weekly')"
                value="weekly"
                @check="data.frequency = 'weekly'"
              >
                <WeeklyBackupIllustration />
              </CheckboxBig>

              <CheckboxBig
                :checked="data.frequency === 'monthly'"
                name="automatic-backups-frequency"
                :title="t('form.option.frequency.monthly')"
                value="monthly"
                @check="data.frequency = 'monthly'"
              >
                <MonthlyBackupIllustration />
              </CheckboxBig>
            </div>
          </div>

          <div
            v-if="data.frequency === 'daily'"
            class="d-flex flex-column"
          >
            <label class="base--text mb-2 p-2 font-weight-600">
              {{ t('form.label.chooseTime') }}
              <FormHelpIcon :text="t('tooltip.automatic_backup.choose_time')" />
            </label>

            <TimePicker v-model="time" :keep="savedTime" />
          </div>

          <div
            v-else-if="data.frequency === 'weekly'"
            class="d-flex flex-column"
          >
            <label
              id="automatic-backups-weekday-label"
              class="base--text mb-2 p-2 font-weight-600"
            >
              {{ t('form.label.chooseDay') }}
              <FormHelpIcon :text="t('tooltip.automatic_backup.choose_day')" />
            </label>

            <div
              aria-labelledby="automatic-backups-weekday-label"
              class="d-flex justify-space-between"
              role="radiogroup"
            >
              <CheckboxBig
                v-for="weekday in WEEKDAYS"
                :key="weekday.localDay"
                :checked="isWeekdaySelected(weekday.localDay)"
                name="automatic-backups-weekday"
                :title="t(`form.option.days.${weekday.key}`)"
                :value="weekday.key"
                @check="setLocalDayOfWeek(weekday.localDay)"
              />
            </div>

            <label class="base--text p-2 pb-2 font-weight-600 mt-6">
              {{ t('form.label.chooseTime') }}
              <FormHelpIcon :text="t('tooltip.automatic_backup.choose_time')" />
            </label>

            <TimePicker v-model="time" :keep="savedTime" />
          </div>

          <div
            v-else-if="data.frequency === 'monthly'"
            class="d-flex flex-column"
          >
            <label class="base--text mb-2 p-2 font-weight-600">
              {{ t('form.label.chooseDay') }}
              <FormHelpIcon :text="t('tooltip.automatic_backup.choose_day')" />
            </label>

            <v-autocomplete
              v-model="parsedMonth"
              hide-details="auto"
              :items="MONTH_DAYS"
              variant="outlined"
            >
              <template #item="{ props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <div class="input-dropdown-item">
                    <span>{{ itemProps.title }}</span>

                    <v-icon
                      class="ml-2 input-dropdown-item__icon"
                      icon="$check"
                    />
                  </div>
                </v-list-item>
              </template>
            </v-autocomplete>

            <label class="base--text mb-2 p-2 font-weight-600">
              {{ t('form.label.chooseTime') }}
              <FormHelpIcon :text="t('tooltip.automatic_backup.choose_time')" />
            </label>

            <TimePicker v-model="time" :keep="savedTime" />
          </div>
        </v-form>
      </div>
    </v-card-text>

    <v-card-actions class="d-flex flex-wrap pb-2">
      <div class="w-100 pb-2">
        <AppButton
          block
          kind="primary"
          :loading="submitting"
          size="large"
          @click="submitSettings"
        >
          <template #loader>
            <Loader
              color="white"
              :size="24"
            />
          </template>

          <span class="p-2 font-weight-600">
            {{ edit ? t('button.automaticBackup.edit') : t('button.automaticBackup.enable') }}
          </span>
        </AppButton>

        <AppButton
          block
          class="normal mt-2"
          kind="text"
          size="large"
          @click="emit('modal-close')"
        >
          <span class="p-2 font-weight-light text-gray-darken-1">{{ t('button.cancel') }}</span>
        </AppButton>
      </div>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  // The schedule maths is in `automatic-backup.ts`; the request is
  // `entities/project/instance-backups.api.ts`, the same one the switch and the confirmation use.
  import type { AutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { saveAutomaticBackupSettings } from '@/entities/project/instance-backups.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import CheckboxBig from '@/shared/ui/buttons/CheckboxBig.vue'
  import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'
  import {
    displayTime,
    formatLocalTime,
    initialSchedule,
    localScheduleToUtcCron,
    MONTH_DAYS,
    parseTimeLabel,
    utcCronScheduleToLocal,
  } from './automatic-backup'
  import DailyBackupIllustration from './illustrations/DailyBackupIllustration.vue'
  import MonthlyBackupIllustration from './illustrations/MonthlyBackupIllustration.vue'
  import WeeklyBackupIllustration from './illustrations/WeeklyBackupIllustration.vue'
  import TimePicker from './TimePicker.vue'

  const props = withDefaults(defineProps<{
    open?: boolean
    settings: AutomaticBackupSettings
    instanceId: number
    edit?: boolean
  }>(), {
    open: false,
    edit: false,
  })

  const emit = defineEmits<{
    'modal-close': []
    'reload-settings': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const submitting = ref(false)
  const data = ref<AutomaticBackupSettings>(initialSchedule(props.settings))

  /** The project's stored time, which the picker keeps on offer when its minute is not a quarter-hour. */
  const savedTime = computed(() => displayTime(props.settings, (key: string) => String(t(key))))

  // The legacy weekday order of the checkboxes: Monday first, Sunday last; `localDay` is the JS weekday (0 = Sunday).
  const WEEKDAYS = [
    { key: 'monday', localDay: 1 },
    { key: 'tuesday', localDay: 2 },
    { key: 'wednesday', localDay: 3 },
    { key: 'thursday', localDay: 4 },
    { key: 'friday', localDay: 5 },
    { key: 'saturday', localDay: 6 },
    { key: 'sunday', localDay: 0 },
  ] as const

  watch(() => props.open, () => {
    data.value = initialSchedule(props.settings)
  })

  function localOf (fields: AutomaticBackupSettings) {
    return utcCronScheduleToLocal({
      hour: fields.cron_hour,
      minute: fields.cron_minute,
      dayOfWeek: fields.frequency === 'weekly' ? fields.cron_day_of_week : undefined,
      dayOfMonth: fields.frequency === 'monthly' ? fields.cron_day_of_month : undefined,
    })
  }

  /** The picked time, shown in local time. */
  const time = computed<string>({
    get: () => {
      const local = localOf(data.value)
      return formatLocalTime(local.hour, local.minute, (key: string) => String(t(key)))
    },
    set: (value: string) => {
      const parsed = parseTimeLabel(value, t('general.pm'))
      if (!parsed) {
        return
      }
      const current = localOf(data.value)
      const utc = localScheduleToUtcCron({
        hour: parsed.hour,
        minute: parsed.minute,
        dayOfWeek: data.value.frequency === 'weekly' ? current.dayOfWeek : undefined,
        dayOfMonth: data.value.frequency === 'monthly' ? current.dayOfMonth : undefined,
      })
      data.value.cron_hour = utc.cron_hour
      data.value.cron_minute = utc.cron_minute
      if (utc.cron_day_of_week !== undefined) {
        data.value.cron_day_of_week = utc.cron_day_of_week
      }
      if (utc.cron_day_of_month !== undefined) {
        data.value.cron_day_of_month = utc.cron_day_of_month
      }
    },
  })

  /** The picked month day, in local time. */
  const parsedMonth = computed<number>({
    get: () => localOf(data.value).dayOfMonth ?? 1,
    set: (value: number) => {
      const local = localOf(data.value)
      const utc = localScheduleToUtcCron({ hour: local.hour, minute: local.minute, dayOfMonth: value })
      data.value.cron_day_of_month = utc.cron_day_of_month
      data.value.cron_hour = utc.cron_hour
      data.value.cron_minute = utc.cron_minute
    },
  })

  function isWeekdaySelected (localDay: number): boolean {
    return localOf(data.value).dayOfWeek === localDay
  }

  function setLocalDayOfWeek (localDay: number): void {
    const local = localOf(data.value)
    const utc = localScheduleToUtcCron({ hour: local.hour, minute: local.minute, dayOfWeek: localDay })
    data.value.cron_day_of_week = utc.cron_day_of_week
    data.value.cron_hour = utc.cron_hour
    data.value.cron_minute = utc.cron_minute
  }

  async function submitSettings (): Promise<void> {
    submitting.value = true
    try {
      await saveAutomaticBackupSettings(props.instanceId, { ...data.value, frequency: data.value.frequency })
      alerts.addAlert({
        success: true,
        successMessage: t(props.edit ? 'notification.instance.autoBackup.edit.success' : 'notification.instance.autoBackup.enabled.success'),
      })
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
    emit('reload-settings')
    emit('modal-close')
    submitting.value = false
  }
</script>

<style lang="scss" scoped>
// V2 `.v-card__title` breaks words anywhere (`word-break: break-all`), which is why the legacy title wraps mid-word on a narrow screen.
.v-card-title {
  min-height: 96px;
  word-break: break-all;
}

// Legacy scoped `.v-dialog .v-card .v-card__actions { padding-top: 16px }` (the dialog rule of the shell is 18px).
.v-card .v-card-actions {
  padding-top: 16px;
}

.checkbox-row {
  display: flex;
  flex-direction: row;

  .checkbox-big {
    width: 100%;

    + .checkbox-big {
      margin-left: 16px;
    }
  }
}

.input-dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .v-icon {
    opacity: 0;
    transition: opacity 0.24s ease;
  }
}

:deep(.v-list-item[aria-selected='true']) .input-dropdown-item {
  font-weight: 600;
  color: rgb(var(--v-theme-primary));

  .v-icon {
    opacity: 1;
  }
}

:global([dir=rtl]) .checkbox-row .checkbox-big + .checkbox-big {
  margin-left: 0;
  margin-right: 16px;
}
</style>
