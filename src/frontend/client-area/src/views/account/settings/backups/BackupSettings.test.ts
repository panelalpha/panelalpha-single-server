import type { FreeBackupDefaults } from './free-backups.api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { controlAfterLabel, labelByText } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import BackupSettings from './BackupSettings.vue'

const ORIGINAL_TZ = process.env.TZ

// UTC hour 12 is 12:00 local in UTC.
const DEFAULTS: FreeBackupDefaults = {
  auto_enable: true,
  frequency: 'daily',
  hour: 12,
  day_of_week: 2,
  day_of_month: 15,
  keep_last: 7,
}

async function mountSettings (props: Record<string, unknown> = {}) {
  return mountKit(BackupSettings, { props: { defaults: DEFAULTS, storeConfigured: true, ...props } })
}

describe('BackupSettings', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC'
  })

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = ORIGINAL_TZ
    }
  })

  it('disables auto enable without a configured store', async () => {
    const without = await mountSettings({ storeConfigured: false })
    const configured = await mountSettings()

    expect(without.find('.backup-auto-enable').classes()).toContain('v-input--disabled')
    expect(configured.find('.backup-auto-enable').classes()).not.toContain('v-input--disabled')
  })

  it('disables every field and shows a hint without a configured store', async () => {
    const without = await mountSettings({ storeConfigured: false })
    const configured = await mountSettings()

    for (const name of ['auto-enable', 'keep-last', 'frequency', 'hour']) {
      expect(without.find(`.backup-${name}`).classes()).toContain('v-input--disabled')
    }
    expect(without.find('[data-testid="backup-no-store-hint"]').exists()).toBe(true)
    expect(configured.find('.backup-keep-last').classes()).not.toContain('v-input--disabled')
    expect(configured.find('[data-testid="backup-no-store-hint"]').exists()).toBe(false)
  })

  it('disables every field while saving', async () => {
    const wrapper = await mountSettings({ disabled: true })

    for (const name of ['auto-enable', 'keep-last', 'frequency', 'hour']) {
      expect(wrapper.find(`.backup-${name}`).classes()).toContain('v-input--disabled')
    }
  })

  it('shows the day of week only for weekly and the day of month only for monthly', async () => {
    const daily = await mountSettings()
    const weekly = await mountSettings({ defaults: { ...DEFAULTS, frequency: 'weekly' } })
    const monthly = await mountSettings({ defaults: { ...DEFAULTS, frequency: 'monthly' } })

    expect(daily.find('.backup-day-of-week').exists()).toBe(false)
    expect(daily.find('.backup-day-of-month').exists()).toBe(false)
    expect(weekly.find('.backup-day-of-week').exists()).toBe(true)
    expect(weekly.find('.backup-day-of-month').exists()).toBe(false)
    expect(monthly.find('.backup-day-of-week').exists()).toBe(false)
    expect(monthly.find('.backup-day-of-month').exists()).toBe(true)
    expect(daily.find('.backup-hour').exists()).toBe(true)
  })

  it('exposes the UTC payload and which keys have a field', async () => {
    const wrapper = await mountSettings({ defaults: { ...DEFAULTS, frequency: 'weekly' } })
    const exposed = wrapper.vm as unknown as { payload: () => unknown, hasField: (key: string) => boolean }

    expect(exposed.payload()).toEqual({
      autoEnable: true,
      frequency: 'weekly',
      hour: 12,
      dayOfWeek: 2,
      dayOfMonth: 15,
      keepLast: 7,
    })
    expect(exposed.hasField('day_of_week')).toBe(true)
    expect(exposed.hasField('day_of_month')).toBe(false)
    expect(exposed.hasField('keep_last')).toBe(true)
  })

  it('emits changed false at once, true after an edit and false again after returning to the stored value', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.emitted('changed')).toEqual([[false]])

    const input = wrapper.find('.backup-keep-last input')
    await input.setValue('8')
    expect(wrapper.emitted('changed')?.at(-1)).toEqual([true])

    await input.setValue('7')
    expect(wrapper.emitted('changed')?.at(-1)).toEqual([false])
  })

  it('treats an empty keep last as changed and invalid', async () => {
    const wrapper = await mountSettings()
    await wrapper.find('.backup-keep-last input').setValue('')

    expect(wrapper.emitted('changed')?.at(-1)).toEqual([true])
    const exposed = wrapper.vm as unknown as { payload: () => { keepLast: number | null } }
    expect(exposed.payload().keepLast).toBeNull()
  })

  it('shows a server error on its field and drops it when the value changes', async () => {
    const wrapper = await mountSettings({ errors: { keep_last: ['The keep last must be at most 365.'] } })

    expect(wrapper.find('.backup-keep-last').text()).toContain('The keep last must be at most 365.')

    await wrapper.find('.backup-keep-last input').setValue('9')
    await nextTick()
    expect(wrapper.find('.backup-keep-last').text()).not.toContain('The keep last must be at most 365.')
  })

  it('resets the form when the stored defaults change', async () => {
    const wrapper = await mountSettings()
    await wrapper.find('.backup-keep-last input').setValue('30')
    expect(wrapper.emitted('changed')?.at(-1)).toEqual([true])

    await wrapper.setProps({ defaults: { ...DEFAULTS, keep_last: 30 } })
    expect(wrapper.emitted('changed')?.at(-1)).toEqual([false])
    expect((wrapper.find('.backup-keep-last input').element as HTMLInputElement).value).toBe('30')
  })
})

describe('BackupSettings labels (kit-form-fields)', () => {
  it('puts each label right above its control (kit-form-fields)', async () => {
    process.env.TZ = 'UTC'
    const wrapper = await mountSettings()
    const root = wrapper.element.parentElement ?? wrapper.element
    const pairs: Array<[string, string]> = [
      ['settings.backups.autoEnable', '.backup-auto-enable'],
      ['settings.backups.keepLast', '.backup-keep-last'],
      ['settings.backups.frequency', '.backup-frequency'],
      ['settings.backups.hour', '.backup-hour'],
    ]
    for (const [text, selector] of pairs) {
      const label = labelByText(root, text)
      expect(label).not.toBeNull()
      expect(controlAfterLabel(root, label!, selector)).not.toBeNull()
    }
    wrapper.unmount()
  })
})
