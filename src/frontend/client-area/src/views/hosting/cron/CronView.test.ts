import type { CronJob, CronJobList } from './cron.api'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { hostingRoutes } from '@/views/hosting/hosting.routes'
import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { openTooltip } from '@/test/tooltip'
import { createCronJob, deleteCronJob, listCronJobs, updateCronJob } from './cron.api'
import CronView from './CronView.vue'

vi.mock('./cron.api', () => ({
  listCronJobs: vi.fn(),
  createCronJob: vi.fn(),
  updateCronJob: vi.fn(),
  deleteCronJob: vi.fn(),
}))

function job (line: string, overrides: Record<string, string> = {}) {
  return {
    line,
    command: `command-${line}`,
    minute: '0',
    hour: '2',
    day_of_month: '*',
    month: '*',
    day_of_week: '*',
    ...overrides,
  }
}

/** The list answer: PHP hosting (`services: null`) unless the services of a container project are given. */
function list (items: CronJob[], services: string[] | null = null): CronJobList {
  return { jobs: items, services }
}

const jobs = [
  job('1'),
  job('2', { minute: '*/5', hour: '*' }),
  job('3', { minute: '60' }),
]

function service (accounts: Array<{ id: number, domain: string, diagnostic_mode?: boolean }> = [{ id: 11, domain: 'example.com', diagnostic_mode: false }]) {
  return makeService({ privileges: ['hosting.manage_cron'], server_accounts: accounts })
}

async function mountCron (hostingService = service()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(CronView, { props: { service: hostingService }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

describe('CronView', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listCronJobs).mockResolvedValue(list(jobs))
  })

  afterAll(() => {
    window.innerWidth = width
  })

  it('loads the jobs of the first account once and lists them with the expression, description and command', async () => {
    const { wrapper } = await mountCron()

    expect(listCronJobs).toHaveBeenCalledTimes(1)
    expect(listCronJobs).toHaveBeenCalledWith(11)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('0 2 * * *')
    expect(rows[0]!.text()).toContain('At 02:00 AM')
    expect(rows[0]!.text()).toContain('command-1')
    expect(rows[1]!.text()).toContain('Every 5 minutes')
    wrapper.unmount()
  })

  it('shows the invalid label for a job whose expression does not parse', async () => {
    const { wrapper } = await mountCron()

    const invalidRow = wrapper.findAll('tbody tr')[2]!
    expect(invalidRow.text()).toContain('60 2 * * *')
    expect(invalidRow.text()).toContain('notification.hosting.cron.invalidExpression')
    wrapper.unmount()
  })

  it('shows the heading, the search and the Add button once there are jobs', async () => {
    const { wrapper } = await mountCron()

    expect(wrapper.get('[data-testid="cron-title"]').text()).toBe('heading.hosting.cron.title')
    expect(wrapper.find('.my-hostings-search').exists()).toBe(true)
    expect(wrapper.get('[data-testid="cron-add"]').isVisible()).toBe(true)
    wrapper.unmount()
  })

  it('names the row icons always; the Add buttons keep their text on mobile and need no aria-label (issue #23)', async () => {
    const { wrapper } = await mountCron()

    expect(wrapper.get('[data-testid="cron-row-edit"]').attributes('aria-label')).toBe('button.cron.update')
    expect(wrapper.get('[data-testid="cron-row-delete"]').attributes('aria-label')).toBe('button.cron.delete')
    expect(wrapper.get('[data-testid="cron-add"]').attributes('aria-label')).toBeUndefined()
    wrapper.unmount()

    window.innerWidth = 375
    vi.mocked(listCronJobs).mockResolvedValue(list([]))
    const { wrapper: mobile } = await mountCron()

    expect(mobile.get('[data-testid="cron-add"]').text()).toBe('button.cron.add')
    expect(mobile.get('[data-testid="cron-add"]').attributes('aria-label')).toBeUndefined()
    expect(mobile.get('[data-testid="cron-empty-add"]').text()).toBe('button.cron.add')
    expect(mobile.get('[data-testid="cron-empty-add"]').attributes('aria-label')).toBeUndefined()
    mobile.unmount()
  })

  it('shows the empty state with the illustration and hides the header controls when there are no jobs', async () => {
    vi.mocked(listCronJobs).mockResolvedValue(list([]))
    const { wrapper } = await mountCron()

    expect(wrapper.find('.no-data').text()).toContain('message.emptyTable.cron.title')
    expect(wrapper.find('.no-data svg').exists()).toBe(true)
    expect(wrapper.get('[data-testid="cron-add"]').isVisible()).toBe(false)
    expect(wrapper.get('[data-testid="cron-empty-add"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not ask the server and raises an alert for a diagnostic account, with no table', async () => {
    const { wrapper, alerts } = await mountCron(service([{ id: 11, domain: 'example.com', diagnostic_mode: true }]))

    expect(listCronJobs).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['message.hostingAccountInDiagnosticMode'])
    expect(wrapper.find('[data-testid="cron-table"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says the list could not be loaded instead of the empty state, and loads it again from Retry', async () => {
    vi.mocked(listCronJobs).mockRejectedValueOnce({ response: { data: { message: 'The server did not answer in time. Please try again in a moment.' } } })
    const { wrapper } = await mountCron()

    expect(wrapper.get('[data-testid="cron-load-error"]').text()).toContain('The server did not answer in time.')
    expect(wrapper.find('.no-data').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cron-empty-add"]').exists()).toBe(false)

    vi.mocked(listCronJobs).mockResolvedValue(list([]))
    await wrapper.get('[data-testid="cron-load-error"] [data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(listCronJobs).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="cron-load-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="cron-empty-add"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('raises an alert on a failed request and keeps the list that was shown', async () => {
    const { wrapper, alerts } = await mountCron(service([{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }]))
    vi.mocked(listCronJobs).mockRejectedValueOnce({ response: { data: { message: 'Server Error' } } })

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', { id: 12, domain: 'b.test' })
    await flushPromises()

    expect(listCronJobs).toHaveBeenLastCalledWith(12)
    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('loads the jobs of the newly selected account and shows the selector only with more than one account', async () => {
    const { wrapper } = await mountCron(service([{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }]))

    expect(wrapper.find('[data-testid="cron-account-selector"]').exists()).toBe(true)
    expect(listCronJobs).toHaveBeenCalledWith(11)

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', { id: 12, domain: 'b.test' })
    await flushPromises()

    expect(listCronJobs).toHaveBeenCalledTimes(2)
    expect(listCronJobs).toHaveBeenLastCalledWith(12)
    wrapper.unmount()
  })

  it('hides the selector with one account', async () => {
    const { wrapper } = await mountCron()

    expect(wrapper.find('[data-testid="cron-account-selector"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('resets to the first account of a new service', async () => {
    const { wrapper } = await mountCron(service([{ id: 11, domain: 'a.test' }]))

    await wrapper.setProps({ service: service([{ id: 21, domain: 'c.test' }]) })
    await flushPromises()

    expect(listCronJobs).toHaveBeenLastCalledWith(21)
    wrapper.unmount()
  })

  it('asks for nothing when the service has no server account', async () => {
    const { wrapper } = await mountCron(service([]))

    expect(listCronJobs).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('drops the answer of the previous account when it arrives after the answer of the selected one', async () => {
    let answerFirst: (value: CronJobList) => void = () => {}
    vi.mocked(listCronJobs)
      .mockReturnValueOnce(new Promise(resolve => {
        answerFirst = resolve
      }))
      .mockResolvedValueOnce(list([job('9', { command: 'second-account' })]))
    const { wrapper } = await mountCron(service([{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }]))

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', { id: 12, domain: 'b.test' })
    await flushPromises()
    answerFirst(list([job('1', { command: 'first-account' })]))
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('second-account')
    wrapper.unmount()
  })

  it('clears the list when a new service has no server account', async () => {
    const { wrapper } = await mountCron()

    await wrapper.setProps({ service: service([]) })
    await flushPromises()

    expect(wrapper.find('[data-testid="cron-add"]').isVisible()).toBe(false)
    wrapper.unmount()
  })
})

describe('CronView project variant', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listCronJobs).mockResolvedValue(list(jobs))
  })

  async function mountProject (hostingService = service()) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = await mountKit(CronView, { props: { service: hostingService, variant: 'project' }, global: { plugins: [pinia] } })
    await flushPromises()
    return { wrapper, alerts: useAlertsStore() }
  }

  it('has the advanced page root and the page-title header', async () => {
    const { wrapper } = await mountProject()

    expect(wrapper.classes()).toContain('advanced-hosting-page')
    const container = wrapper.get('.page-title.page-title--advanced')
    expect(container.get('.page-title__title-box h4.page-title__title').attributes('data-testid')).toBe('cron-title')
    const filters = container.get('.page-title__filter-controls')
    expect(filters.classes()).not.toContain('justify-end')
    expect(filters.classes()).not.toContain('align-end')
    // V4 grid paddings and the row margin beat the global `.page-title--advanced` rules.
    expect(container.classes()).toContain('py-3')
    expect(container.get('.v-row').classes()).toContain('mb-0')
    expect(container.get('.page-title__title-box').classes()).toContain('py-0')
    expect(filters.classes()).toEqual(expect.arrayContaining(['pt-4', 'pt-lg-0', 'pb-0']))
    expect(wrapper.findAll('.v-container')[1]!.classes()).toEqual(expect.arrayContaining(['mt-3', 'px-0', 'pt-0']))
    expect(wrapper.find('.title-row').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the hosting header and root in the default variant', async () => {
    const { wrapper } = await mountCron()

    expect(wrapper.classes()).not.toContain('advanced-hosting-page')
    expect(wrapper.find('.page-title--advanced').exists()).toBe(false)
    expect(wrapper.find('.title-row').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not show the account selector even for several accounts and loads the first account once', async () => {
    const { wrapper } = await mountProject(service([{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }]))

    expect(wrapper.find('[data-testid="cron-account-selector"]').exists()).toBe(false)
    expect(listCronJobs).toHaveBeenCalledTimes(1)
    expect(listCronJobs).toHaveBeenCalledWith(11)
    wrapper.unmount()
  })

  it('raises the diagnostic alert on mount like the hosting variant, with no request and no table', async () => {
    const { wrapper, alerts } = await mountProject(service([{ id: 11, domain: 'example.com', diagnostic_mode: true }]))

    expect(listCronJobs).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['message.hostingAccountInDiagnosticMode'])
    expect(wrapper.find('[data-testid="cron-table"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('makes no request and keeps the skeleton without an account id', async () => {
    const { wrapper } = await mountProject(service([{ domain: 'example.com' } as unknown as { id: number, domain: string }]))

    expect(listCronJobs).not.toHaveBeenCalled()
    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not reload for a new service reference with the same account id', async () => {
    const { wrapper } = await mountProject()

    await wrapper.setProps({ service: service() })
    await flushPromises()

    expect(listCronJobs).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('reloads for a new account id', async () => {
    const { wrapper } = await mountProject()

    await wrapper.setProps({ service: service([{ id: 12, domain: 'two.example.com' }]) })
    await flushPromises()

    expect(listCronJobs).toHaveBeenCalledTimes(2)
    expect(listCronJobs).toHaveBeenLastCalledWith(12)
    wrapper.unmount()
  })

  it('a new reference with the same id and diagnostic mode makes no request and drops the table', async () => {
    const { wrapper, alerts } = await mountProject()

    await wrapper.setProps({ service: service([{ id: 11, domain: 'example.com', diagnostic_mode: true }]) })
    await flushPromises()

    expect(listCronJobs).toHaveBeenCalledTimes(1)
    // No reload for the same id, so no diagnostic alert either.
    expect(alerts.activeAlerts).toEqual([])
    expect(wrapper.find('[data-testid="cron-table"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('CronView Add and Edit modal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listCronJobs).mockResolvedValue(list(jobs))
    vi.mocked(createCronJob).mockResolvedValue(undefined)
    vi.mocked(updateCronJob).mockResolvedValue(undefined)
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  const newJob = job('4', { command: 'backup.sh', minute: '*/5', hour: '*' })

  const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
  const inputsOf = (testId: string) => [...document.body.querySelectorAll<HTMLElement>('[data-testid]')]
    .filter(node => node.dataset.testid === testId)
    .flatMap(node => [...node.querySelectorAll<HTMLInputElement>('input')])
  const expressionValues = () => inputsOf('cron-expression').map(input => input.value)
  const expressionText = () => bodyQuery('[data-testid="cron-expression"]')?.textContent ?? ''
  const modalButtons = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid="cron-modal"] .v-card-actions .v-btn')]
  const modalOpen = () => Boolean(bodyQuery('[data-testid="cron-modal"]')?.closest('.v-overlay--active'))

  function commonSettingsSelect (wrapper: VueWrapper) {
    return wrapper.findAllComponents({ name: 'VSelect' })
      .find(select => (select.props('items') as Array<{ value: string }>).some(item => item.value === 'custom'))!
  }

  async function typeInto (input: HTMLInputElement, value: string): Promise<void> {
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flushPromises()
  }

  async function openAdd (wrapper: VueWrapper): Promise<void> {
    await wrapper.get('[data-testid="cron-add"]').trigger('click')
    await flushPromises()
  }

  async function saveAdd (wrapper: VueWrapper, command: string): Promise<void> {
    await openAdd(wrapper)
    await typeInto(inputsOf('cron-command')[0]!, command)
    modalButtons()[0]!.click()
    await flushPromises()
  }

  it('opens Add with every 5 minutes, its frequency description and an empty command', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)

    expect(bodyQuery('[data-testid="cron-modal"]')!.textContent).toContain('heading.hosting.cron.modal.add.title')
    expect(expressionValues()).toEqual(['*/5', '*', '*', '*', '*'])
    expect(expressionText()).toContain('form.label.frequency: Every 5 minutes')
    expect(commonSettingsSelect(wrapper).props('modelValue')).toBe('every_5_minutes')
    expect(inputsOf('cron-command')[0]!.value).toBe('')
    expect(modalOpen()).toBe(true)
    wrapper.unmount()
  })

  it('takes the 560px width from the global card-width-560 class, not an inline style (legacy `style="width:560px"`)', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)

    const card = bodyQuery('[data-testid="cron-modal"]')!
    expect(card.classList.contains('card-width-560')).toBe(true)
    expect(card.getAttribute('style') ?? '').not.toContain('width')
    wrapper.unmount()
  })

  it('a frequency preset overwrites the five fields and the description follows', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)

    commonSettingsSelect(wrapper).vm.$emit('update:modelValue', 'once_a_day')
    await flushPromises()

    expect(expressionValues()).toEqual(['0', '0', '*', '*', '*'])
    expect(expressionText()).toContain('At 12:00 AM')
    wrapper.unmount()
  })

  it('shows the invalid label in the description for an expression that does not parse', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)

    await typeInto(inputsOf('cron-expression')[0]!, '60')

    expect(expressionText()).toContain('form.label.frequency: notification.hosting.cron.invalidExpression')
    wrapper.unmount()
  })

  it('POSTs the Add payload, alerts, reloads, highlights the saved row and closes the dialog', async () => {
    const { wrapper, alerts } = await mountCron()
    vi.mocked(listCronJobs).mockResolvedValue(list([...jobs, newJob]))

    await saveAdd(wrapper, 'backup.sh')

    expect(createCronJob).toHaveBeenCalledWith(11, {
      common_settings: 'every_5_minutes',
      minute: '*/5',
      hour: '*',
      day_of_month: '*',
      month: '*',
      day_of_week: '*',
      command: 'backup.sh',
    })
    expect(listCronJobs).toHaveBeenCalledTimes(2)
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.hosting.cron.add.success'])
    expect(modalOpen()).toBe(false)
    expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(1)
    expect(wrapper.find('tbody tr.highlight').text()).toContain('backup.sh')
    wrapper.unmount()
  })

  it('clears the highlight of a saved row one second later', async () => {
    const { wrapper } = await mountCron()
    vi.mocked(listCronJobs).mockResolvedValue(list([...jobs, newJob]))
    await openAdd(wrapper)
    await typeInto(inputsOf('cron-command')[0]!, 'backup.sh')

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      modalButtons()[0]!.click()
      await flushPromises()
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(1)

      vi.advanceTimersByTime(999)
      await nextTick()
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(1)

      vi.advanceTimersByTime(1)
      await nextTick()
      expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
    wrapper.unmount()
  })

  it('a failed save keeps the dialog open and raises the error alert', async () => {
    vi.mocked(createCronJob).mockRejectedValueOnce({ response: { data: { message: 'Hosting Server is not accessible' } } })
    const { wrapper, alerts } = await mountCron()

    await saveAdd(wrapper, 'backup.sh')

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Hosting Server is not accessible'])
    expect(modalOpen()).toBe(true)
    expect(listCronJobs).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not send a job while the command is empty', async () => {
    const { wrapper } = await mountCron()

    await saveAdd(wrapper, '')

    expect(createCronJob).not.toHaveBeenCalled()
    expect(modalOpen()).toBe(true)
    wrapper.unmount()
  })

  it('Edit starts in the preset whose five fields match the row exactly', async () => {
    const { wrapper } = await mountCron()

    await wrapper.findAll('[data-testid="cron-row-edit"]')[1]!.trigger('click')
    await flushPromises()

    expect(commonSettingsSelect(wrapper).props('modelValue')).toBe('every_5_minutes')
    expect(expressionValues()).toEqual(['*/5', '*', '*', '*', '*'])
  })

  it('Edit opens with the row values and the custom frequency, and PUTs to the row line', async () => {
    const { wrapper, alerts } = await mountCron()

    await wrapper.findAll('[data-testid="cron-row-edit"]')[0]!.trigger('click')
    await flushPromises()

    expect(bodyQuery('[data-testid="cron-modal"]')!.textContent).toContain('heading.hosting.cron.modal.update.title')
    expect(commonSettingsSelect(wrapper).props('modelValue')).toBe('custom')
    expect(expressionValues()).toEqual(['0', '2', '*', '*', '*'])
    expect(expressionText()).toContain('At 02:00 AM')
    expect(inputsOf('cron-command')[0]!.value).toBe('command-1')

    await typeInto(inputsOf('cron-command')[0]!, 'changed')
    modalButtons()[0]!.click()
    await flushPromises()

    expect(updateCronJob).toHaveBeenCalledWith(11, '1', {
      common_settings: 'custom',
      minute: '0',
      hour: '2',
      day_of_month: '*',
      month: '*',
      day_of_week: '*',
      command: 'changed',
    })
    expect(createCronJob).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.hosting.cron.update.success'])
    expect(modalOpen()).toBe(false)
    wrapper.unmount()
  })

  describe('on a container project (ID-47)', () => {
    const containerJobs = [job('a1', { command: 'php artisan queue:work', service: 'worker' })]

    function serviceSelect (wrapper: VueWrapper) {
      return wrapper.findAllComponents({ name: 'VSelect' })
        .find(select => (select.props('items') as Array<{ value: string }>).some(item => item.value === 'app'))!
    }

    it('shows the Service column and starts a new job in the first service, then POSTs the chosen one', async () => {
      vi.mocked(listCronJobs).mockResolvedValue(list(containerJobs, ['app', 'worker']))
      const { wrapper } = await mountCron()

      expect(wrapper.text()).toContain('table.header.service')
      expect(wrapper.find('tbody tr').text()).toContain('worker')

      await openAdd(wrapper)
      expect(bodyQuery('[data-testid="cron-service"]')).not.toBeNull()
      expect(serviceSelect(wrapper).props('modelValue')).toBe('app')

      serviceSelect(wrapper).vm.$emit('update:modelValue', 'worker')
      await flushPromises()
      await typeInto(inputsOf('cron-command')[0]!, 'php artisan schedule:run')
      modalButtons()[0]!.click()
      await flushPromises()

      expect(createCronJob).toHaveBeenCalledWith(11, expect.objectContaining({ command: 'php artisan schedule:run', service: 'worker' }))
      wrapper.unmount()
    })

    it('opens Edit with the service of the job, kept as an option when the project has it no more, and PUTs it', async () => {
      vi.mocked(listCronJobs).mockResolvedValue(list(containerJobs, ['app']))
      const { wrapper } = await mountCron()

      await wrapper.findAll('[data-testid="cron-row-edit"]')[0]!.trigger('click')
      await flushPromises()

      expect(serviceSelect(wrapper).props('modelValue')).toBe('worker')
      expect((serviceSelect(wrapper).props('items') as Array<{ value: string }>).map(item => item.value)).toEqual(['app', 'worker'])

      modalButtons()[0]!.click()
      await flushPromises()

      expect(updateCronJob).toHaveBeenCalledWith(11, 'a1', expect.objectContaining({ command: 'php artisan queue:work', service: 'worker' }))
      wrapper.unmount()
    })

    it('has no Service column or field on PHP hosting', async () => {
      const { wrapper } = await mountCron()

      expect(wrapper.text()).not.toContain('table.header.service')
      await openAdd(wrapper)
      expect(bodyQuery('[data-testid="cron-service"]')).toBeNull()
      wrapper.unmount()
    })

    it('says the project has no container services yet and opens no dead-end Add dialog', async () => {
      vi.mocked(listCronJobs).mockResolvedValue(list(containerJobs, []))
      const { wrapper } = await mountCron()

      expect(wrapper.get('[data-testid="cron-no-services"]').text()).toBe('message.hosting.cron.noServices')
      expect(wrapper.get('[data-testid="cron-add"]').attributes('disabled')).toBeDefined()

      await openAdd(wrapper)
      expect(modalOpen()).toBe(false)
      wrapper.unmount()
    })

    it('shows the same message and a disabled Add in the empty state of a project without services', async () => {
      vi.mocked(listCronJobs).mockResolvedValue(list([], []))
      const { wrapper } = await mountCron()

      expect(wrapper.get('[data-testid="cron-no-services"]').text()).toBe('message.hosting.cron.noServices')
      expect(wrapper.get('[data-testid="cron-empty-add"]').attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('keeps the confirm button disabled in an Add dialog opened without a service', async () => {
      vi.mocked(listCronJobs).mockResolvedValue(list(containerJobs, ['app']))
      const { wrapper } = await mountCron()

      await openAdd(wrapper)
      serviceSelect(wrapper).vm.$emit('update:modelValue', null)
      await flushPromises()

      expect(modalButtons()[0]!.classList.contains('v-btn--disabled')).toBe(true)
      modalButtons()[0]!.click()
      await flushPromises()
      expect(createCronJob).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  it('sends no service after switching from a container account to a PHP account', async () => {
    const containerAccount = { id: 11, domain: 'a.test' }
    const phpAccount = { id: 12, domain: 'b.test' }
    vi.mocked(listCronJobs)
      .mockResolvedValueOnce(list([job('a1', { command: 'php artisan queue:work', service: 'worker' })], ['app', 'worker']))
      .mockResolvedValueOnce(list(jobs))
    const { wrapper } = await mountCron(service([containerAccount, phpAccount]))

    expect(wrapper.text()).toContain('table.header.service')

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', phpAccount)
    await flushPromises()

    expect(wrapper.text()).not.toContain('table.header.service')
    await openAdd(wrapper)
    expect(bodyQuery('[data-testid="cron-service"]')).toBeNull()
    await typeInto(inputsOf('cron-command')[0]!, 'backup.sh')
    modalButtons()[0]!.click()
    await flushPromises()

    expect(createCronJob).toHaveBeenCalledWith(12, {
      common_settings: 'every_5_minutes',
      minute: '*/5',
      hour: '*',
      day_of_month: '*',
      month: '*',
      day_of_week: '*',
      command: 'backup.sh',
    })
    wrapper.unmount()
  })

  it('drops the services of the previous account when the reload of the new one fails', async () => {
    const containerAccount = { id: 11, domain: 'a.test' }
    const phpAccount = { id: 12, domain: 'b.test' }
    vi.mocked(listCronJobs)
      .mockResolvedValueOnce(list([job('a1', { command: 'php artisan queue:work', service: 'worker' })], ['app', 'worker']))
      .mockRejectedValueOnce({ response: { data: { message: 'Server Error' } } })
    const { wrapper } = await mountCron(service([containerAccount, phpAccount]))

    expect(wrapper.text()).toContain('table.header.service')

    wrapper.findComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', phpAccount)
    await flushPromises()

    expect(wrapper.text()).not.toContain('table.header.service')
    await openAdd(wrapper)
    expect(bodyQuery('[data-testid="cron-service"]')).toBeNull()
    await typeInto(inputsOf('cron-command')[0]!, 'backup.sh')
    modalButtons()[0]!.click()
    await flushPromises()

    expect(createCronJob).toHaveBeenCalledWith(12, {
      common_settings: 'every_5_minutes',
      minute: '*/5',
      hour: '*',
      day_of_month: '*',
      month: '*',
      day_of_week: '*',
      command: 'backup.sh',
    })
    wrapper.unmount()
  })

  it('choosing custom keeps the fields typed by hand', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)

    await typeInto(inputsOf('cron-expression')[0]!, '15')
    commonSettingsSelect(wrapper).vm.$emit('update:modelValue', 'custom')
    await flushPromises()

    expect(expressionValues()).toEqual(['15', '*', '*', '*', '*'])
    expect(expressionText()).toContain('form.label.frequency: At 15 minutes past the hour')
    wrapper.unmount()
  })

  it('a failed Edit keeps the dialog open with the error alert and no reload', async () => {
    vi.mocked(updateCronJob).mockRejectedValueOnce({ response: { data: { message: 'Hosting Server is not accessible' } } })
    const { wrapper, alerts } = await mountCron()

    await wrapper.findAll('[data-testid="cron-row-edit"]')[0]!.trigger('click')
    await flushPromises()
    modalButtons()[0]!.click()
    await flushPromises()

    expect(updateCronJob).toHaveBeenCalledTimes(1)
    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Hosting Server is not accessible'])
    expect(modalOpen()).toBe(true)
    expect(listCronJobs).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
    wrapper.unmount()
  })

  it('offers the seven WP Cloud frequencies to a WP Cloud host and the eleven standard ones otherwise', async () => {
    const standard = await mountCron()
    await openAdd(standard.wrapper)
    expect((commonSettingsSelect(standard.wrapper).props('items') as unknown[])).toHaveLength(11)
    standard.wrapper.unmount()

    const wpCloud = await mountCron(makeService({
      privileges: ['hosting.manage_cron'],
      hosting_server_type: 'wp-cloud',
      server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: false }],
    }))
    await openAdd(wpCloud.wrapper)
    const values = (commonSettingsSelect(wpCloud.wrapper).props('items') as Array<{ value: string }>).map(item => item.value)

    expect(values).toEqual(['custom', 'every_5_minutes', 'twice_an_hour', 'once_an_hour', 'twice_a_day', 'once_a_day', 'once_a_week'])
    wpCloud.wrapper.unmount()
  })

  it('locks the page scroll while the dialog is open', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)
    expect(document.documentElement.classList.contains('scrollLock')).toBe(true)

    modalButtons()[1]!.click()
    await flushPromises()

    expect(modalOpen()).toBe(false)
    expect(document.documentElement.classList.contains('scrollLock')).toBe(false)
    wrapper.unmount()
  })
  it('opens Add after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
    const { wrapper } = await mountCron()
    await openAdd(wrapper)

    const overlay = expectOverlayBeforeCard('[data-testid="cron-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })
})

describe('CronView Delete modal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listCronJobs).mockResolvedValue(list(jobs))
    vi.mocked(deleteCronJob).mockResolvedValue(undefined)
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
  const modalButtons = () => [...document.body.querySelectorAll<HTMLButtonElement>('[data-testid="cron-modal"] .v-card-actions .v-btn')]
  const modalOpen = () => Boolean(bodyQuery('[data-testid="cron-modal"]')?.closest('.v-overlay--active'))
  const confirmBox = () => document.body.querySelector<HTMLInputElement>('[data-testid="cron-confirm"] input')!

  async function openDelete (wrapper: VueWrapper, index: number): Promise<void> {
    await wrapper.findAll('[data-testid="cron-row-delete"]')[index]!.trigger('click')
    await flushPromises()
  }

  it('opens Delete with the confirm checkbox only, and the Delete button stays disabled until the box is ticked', async () => {
    const { wrapper } = await mountCron()
    await openDelete(wrapper, 0)

    expect(bodyQuery('[data-testid="cron-modal"]')!.textContent).toContain('heading.hosting.cron.modal.delete.title')
    expect(bodyQuery('[data-testid="cron-expression"]')).toBeNull()
    expect(modalButtons()[0]!.textContent).toContain('button.delete')
    expect(modalButtons()[0]!.disabled).toBe(true)

    confirmBox().click()
    await flushPromises()

    expect(modalButtons()[0]!.disabled).toBe(false)
    wrapper.unmount()
  })

  it('DELETEs the row line once confirmed, reloads, alerts and closes without a highlight', async () => {
    const { wrapper, alerts } = await mountCron()
    vi.mocked(listCronJobs).mockResolvedValue(list(jobs.slice(1)))
    await openDelete(wrapper, 0)
    confirmBox().click()
    await flushPromises()

    modalButtons()[0]!.click()
    await flushPromises()

    expect(deleteCronJob).toHaveBeenCalledWith(11, '1')
    expect(listCronJobs).toHaveBeenCalledTimes(2)
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.hosting.cron.delete.success'])
    expect(modalOpen()).toBe(false)
    expect(wrapper.findAll('tbody tr.highlight')).toHaveLength(0)
    wrapper.unmount()
  })

  it('a failed delete keeps the dialog open and raises the error alert', async () => {
    vi.mocked(deleteCronJob).mockRejectedValueOnce({ response: { data: { message: 'Hosting Server is not accessible' } } })
    const { wrapper, alerts } = await mountCron()
    await openDelete(wrapper, 0)
    confirmBox().click()
    await flushPromises()

    modalButtons()[0]!.click()
    await flushPromises()

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Hosting Server is not accessible'])
    expect(modalOpen()).toBe(true)
    expect(listCronJobs).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('on a mobile layout Delete still gets the row line of the row it was opened from', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountCron()
    await openDelete(wrapper, 1)
    confirmBox().click()
    await flushPromises()

    modalButtons()[0]!.click()
    await flushPromises()

    expect(deleteCronJob).toHaveBeenCalledWith(11, '2')
    wrapper.unmount()
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a job with the legacy markup', async () => {
    window.innerWidth = 500
    vi.mocked(listCronJobs).mockResolvedValue(list([jobs[0]!]))
    const { wrapper } = await mountCron()

    expect(normalizeHtml(wrapper.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.cronExpression</div><div class="mobile-table-item__value"><span class="bold p-3">0 2 * * *</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.description</div><div class="mobile-table-item__value"><span class="p-3">At 02:00 AM</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.command</div><div class="mobile-table-item__value"><span class="p-3">command-1</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.cron.update" data-testid="cron-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.cron.delete" data-testid="cron-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  it('renders the desktop row of a job unchanged', async () => {
    vi.mocked(listCronJobs).mockResolvedValue(list([jobs[0]!]))
    const { wrapper } = await mountCron()

    expect(normalizeHtml(wrapper.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr class="v-data-table__tr"><td class="v-data-table__td v-data-table-column--align-start">0 2 * * *</td><td class="v-data-table__td v-data-table-column--align-start">At 02:00 AM</td><td class="v-data-table__td v-data-table-column--align-start">command-1</td><td class="v-data-table__td v-data-table-column--align-start"><div class="d-flex actions-row"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.cron.update" data-testid="cron-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.cron.delete" data-testid="cron-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></td></tr>"`)
    wrapper.unmount()
  })

  // Characterization of the row tooltips: text, markup and the link to the button stay as written by hand.
  it('opens the tooltip of the Edit and Delete icons on hover, with the key as text and aria-describedby on the button', async () => {
    const { wrapper } = await mountCron()

    for (const [testId, key] of [['cron-row-edit', 'button.cron.update'], ['cron-row-delete', 'button.cron.delete']] as const) {
      const button = wrapper.findAll(`[data-testid="${testId}"]`)[0]!
      const content = await openTooltip(button)
      expect(content.textContent).toBe(key)
      expect(normalizeHtml(content.innerHTML)).toBe(`<span>${key}</span>`)
      expect(content.closest('.v-tooltip')!.classList.contains('v-overlay--active')).toBe(true)
    }
    wrapper.unmount()
  })
})

describe('hosting routes (cron)', () => {
  it('has /hosting/cron as a child of the frame with the cron title', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const cron = frame.children!.find(route => route.path === '/hosting/cron')!

    expect(cron.name).toBe('hosting-cron')
    expect(cron.meta).toEqual({ title: 'cron' })
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.resetAllMocks()
    window.innerWidth = 1600
    vi.mocked(listCronJobs).mockResolvedValue(list(jobs))
  })

  afterAll(() => {
    window.innerWidth = width
  })

  function commands (wrapper: VueWrapper): string[] {
    return wrapper.findAll('tbody tr').map(row => row.findAll('td')[2]!.text())
  }

  it('sorts by the clicked header, and a second click on it reverses the order', async () => {
    const { wrapper } = await mountCron()

    // A first click picks the column (descending, the default direction), the second flips it.
    await wrapper.get('tr.custom-sort .item--command .custom-sort__item').trigger('click')
    await nextTick()
    expect(commands(wrapper)).toEqual(['command-3', 'command-2', 'command-1'])

    await wrapper.get('tr.custom-sort .item--command .custom-sort__item').trigger('click')
    await nextTick()
    expect(commands(wrapper)).toEqual(['command-1', 'command-2', 'command-3'])
    wrapper.unmount()
  })

  it('does not sort by the actions column', async () => {
    const { wrapper } = await mountCron()

    expect(wrapper.get('tr.custom-sort .item--actions .custom-sort__item').classes()).not.toContain('custom-sort__item--sortable')
    wrapper.unmount()
  })

  it('filters the rows by the search term and shows no-results with Clear filters when nothing matches', async () => {
    const { wrapper } = await mountCron()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'command-2')
    await flushPromises()
    expect(commands(wrapper)).toEqual(['command-2'])

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'zzz')
    await flushPromises()
    expect(wrapper.find('.no-results-container').exists()).toBe(true)
    expect(wrapper.find('.no-data').exists()).toBe(false)

    await wrapper.get('.no-results-container button').trigger('click')
    await flushPromises()
    expect(commands(wrapper)).toHaveLength(3)
    wrapper.unmount()
  })

  it('pages the rows by 8 and shows the footer with the second page', async () => {
    vi.mocked(listCronJobs).mockResolvedValue(list(Array.from({ length: 9 }, (_, index) => job(String(index + 1)))))
    const { wrapper } = await mountCron()

    expect(wrapper.findAll('tbody tr')).toHaveLength(8)
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(2)

    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the skeleton instead of the rows while loading and no footer', async () => {
    vi.mocked(listCronJobs).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountCron()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cron-row-edit"]').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the empty message in the table and no header or footer for an empty list', async () => {
    vi.mocked(listCronJobs).mockResolvedValue(list([]))
    const { wrapper } = await mountCron()

    expect(wrapper.get('[data-testid="cron-table"] .no-data').text()).toContain('message.emptyTable.cron.title')
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens Edit and Delete with the row of the clicked line from the actions column', async () => {
    const { wrapper } = await mountCron()

    await wrapper.findAll('[data-testid="cron-row-edit"]')[1]!.trigger('click')
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>('[data-testid="cron-command"] input, [data-testid="cron-command"] textarea')?.value).toBe('command-2')
    wrapper.unmount()
  })

  it('renders each job as a card below 976 px with the three fields and the actions, and no sort header', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountCron()

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const cards = wrapper.findAll('tbody tr .mobile-table-item')
    expect(cards).toHaveLength(3)
    expect(cards[1]!.text()).toContain('command-2')
    expect(cards[1]!.findAll('.mobile-table-item__row')).toHaveLength(4)
    expect(cards[1]!.find('[data-testid="cron-row-edit"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
