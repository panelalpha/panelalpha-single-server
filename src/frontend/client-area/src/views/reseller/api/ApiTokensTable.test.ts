import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import ApiTokensTable from './ApiTokensTable.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  listResellerApiTokens: vi.fn(),
  createResellerApiToken: vi.fn(),
  deleteResellerApiToken: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const TOKENS = [
  { id: 1, name: 'CI', last_used_at: null, created_at: '2026-10-01T10:00:00.000000Z' },
]

async function mountTable () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(ApiTokensTable, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

describe('ApiTokensTable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the title and fetches the tokens once on mount', async () => {
    vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(TOKENS)
    const { wrapper } = await mountTable()
    await flushPromises()

    expect(wrapper.get('[data-testid="reseller-api-title"]').text()).toBe('heading.reseller.page.api')
    expect(resellerApi.listResellerApiTokens).toHaveBeenCalledTimes(1)
  })

  it('shows the skeleton while the tokens load, without the empty state or the header controls', async () => {
    const pending = deferred<typeof TOKENS>()
    vi.mocked(resellerApi.listResellerApiTokens).mockReturnValue(pending.promise)
    const { wrapper } = await mountTable()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reseller-api-empty"]').exists()).toBe(false)
    expect(wrapper.find('.my-hostings-search').exists()).toBe(false)

    pending.resolve(TOKENS)
    await flushPromises()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
    expect(wrapper.find('.my-hostings-search').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reseller-api-create"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reseller-api-create"]').attributes('aria-label')).toBe('button.apiToken.create')
  })

  it('shows the empty state without the search and the header button when there are no tokens', async () => {
    vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue([])
    const { wrapper } = await mountTable()
    await flushPromises()

    const empty = wrapper.get('[data-testid="reseller-api-empty"]')
    expect(empty.text()).toContain('reseller.apiTokens.noTokens')
    expect(empty.text()).toContain('reseller.apiTokens.noTokensDesc')
    expect(empty.find('[data-testid="reseller-api-create-empty"]').exists()).toBe(true)
    expect(empty.find('[data-testid="reseller-api-create-empty"]').attributes('aria-label')).toBe('button.apiToken.create')
    expect(wrapper.find('.my-hostings-search').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reseller-api-create"]').exists()).toBe(false)
  })

  it('alerts about a failed fetch and shows the empty state', async () => {
    vi.mocked(resellerApi.listResellerApiTokens).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountTable()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(wrapper.find('[data-testid="reseller-api-empty"]').exists()).toBe(true)
  })

  describe('desktop list', () => {
    const LIST = [
      { id: 1, name: 'Beta', last_used_at: '2026-10-02T10:00:00.000000Z', created_at: '2026-10-01T10:00:00.000000Z' },
      { id: 2, name: 'Alpha', last_used_at: null, created_at: '2026-10-03T10:00:00.000000Z' },
      { id: 3, name: 'Gamma', last_used_at: '2026-10-04T10:00:00.000000Z', created_at: '2026-10-02T10:00:00.000000Z' },
    ]

    function names (wrapper: Awaited<ReturnType<typeof mountTable>>['wrapper']): string[] {
      return wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())
    }

    async function clickHeader (wrapper: Awaited<ReturnType<typeof mountTable>>['wrapper'], text: string) {
      const item = wrapper.findAll('.custom-sort__item').find(el => el.text().includes(text))!
      await item.trigger('click')
      await flushPromises()
    }

    it('sorts by name ascending by default, reverses on the same column and changes the column without resetting the direction', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(LIST)
      const { wrapper } = await mountTable()
      await flushPromises()
      expect(names(wrapper)).toEqual(['Alpha', 'Beta', 'Gamma'])

      await clickHeader(wrapper, 'name')
      expect(names(wrapper)).toEqual(['Gamma', 'Beta', 'Alpha'])

      await clickHeader(wrapper, 'created_at')
      // created_at descending (direction kept): Alpha (03), Gamma (02), Beta (01)
      expect(names(wrapper)).toEqual(['Alpha', 'Gamma', 'Beta'])
    })

    it('puts the null last_used_at first ascending and shows general.never', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(LIST)
      const { wrapper } = await mountTable()
      await flushPromises()

      await clickHeader(wrapper, 'last_used_at')
      expect(names(wrapper)[0]).toBe('Alpha')
      const firstRow = wrapper.findAll('tbody tr')[0]!
      expect(firstRow.text()).toContain('general.never')
      expect(firstRow.find('.text-disabled.font-italic').exists()).toBe(true)
    })

    it('renders the delete button in the actions cell', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(LIST)
      const { wrapper } = await mountTable()
      await flushPromises()

      expect(wrapper.findAll('[data-testid="reseller-api-token-delete"]')).toHaveLength(3)
      expect(wrapper.find('[data-testid="reseller-api-token-delete"]').attributes('aria-label')).toBe('reseller.apiTokens.delete')
    })

    it('hides the footer for up to 10 tokens and paginates 11', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(LIST)
      const { wrapper } = await mountTable()
      await flushPromises()
      expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)

      const many = Array.from({ length: 11 }, (_, index) => ({
        id: index + 1,
        name: `Token ${String(index + 1).padStart(2, '0')}`,
        last_used_at: null,
        created_at: '2026-10-01T10:00:00.000000Z',
      }))
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(many)
      const second = await mountTable()
      await flushPromises()

      expect(second.wrapper.find('.data-iterator-footer').exists()).toBe(true)
      expect(second.wrapper.findAll('tbody tr')).toHaveLength(10)
      await second.wrapper.get('.v-pagination__next button').trigger('click')
      await flushPromises()
      expect(names(second.wrapper)).toEqual(['Token 11'])
    })
  })

  describe('search and mobile', () => {
    const MOBILE_WIDTH = 900
    const DESKTOP_WIDTH = 1400

    function setWidth (width: number): void {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
    }

    function tokenList (count: number, name = (index: number) => `Token ${String(index).padStart(2, '0')}`) {
      return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: name(index + 1),
        last_used_at: null,
        created_at: '2026-10-01T10:00:00.000000Z',
      }))
    }

    type Wrapper = Awaited<ReturnType<typeof mountTable>>['wrapper']

    function names (wrapper: Wrapper): string[] {
      return wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text())
    }

    async function search (wrapper: Wrapper, term: string) {
      // The search field applies its model after a 300 ms debounce.
      vi.useFakeTimers()
      await wrapper.get('.my-hostings-search input').setValue(term)
      vi.advanceTimersByTime(300)
      vi.useRealTimers()
      await flushPromises()
    }

    async function goToPage (wrapper: Wrapper, label: string) {
      await wrapper.get(`.v-pagination button[aria-label="${label}"]`).trigger('click')
      await flushPromises()
    }

    beforeEach(() => {
      setWidth(DESKTOP_WIDTH)
    })

    afterEach(() => {
      vi.useRealTimers()
      setWidth(1024)
    })

    it('filters the list by the name', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(tokenList(3, index => ['Alpha', 'Beta', 'Gamma'][index - 1]!))
      const { wrapper } = await mountTable()
      await flushPromises()

      await search(wrapper, 'amm')

      expect(names(wrapper)).toEqual(['Gamma'])
    })

    it('shows no results for a search without matches and clears the filter', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(tokenList(3))
      const { wrapper } = await mountTable()
      await flushPromises()

      await search(wrapper, 'zzz')
      expect(wrapper.find('.no-results-container').exists()).toBe(true)
      expect(wrapper.findAll('tbody tr.v-data-table__tr')).toHaveLength(0)

      const clear = wrapper.get('.no-results-container button')
      expect(clear.text()).toContain('button.clearFilter')
      await clear.trigger('click')
      await flushPromises()

      expect(wrapper.find('.no-results-container').exists()).toBe(false)
      expect(names(wrapper)).toHaveLength(3)
    })

    it('keeps page 2 when the search still leaves more than one page', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(tokenList(30, index => `${index <= 15 ? 'Prod' : 'Dev'} ${String(index).padStart(2, '0')}`))
      const { wrapper } = await mountTable()
      await flushPromises()
      await goToPage(wrapper, 'Go to page 2')

      await search(wrapper, 'prod')

      expect(names(wrapper)).toEqual(['Prod 11', 'Prod 12', 'Prod 13', 'Prod 14', 'Prod 15'])
      expect(wrapper.find('.v-pagination__item--is-active').text()).toBe('2')
    })

    it('trims page 2 down to the single result of a narrower search', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(tokenList(30))
      const { wrapper } = await mountTable()
      await flushPromises()
      await goToPage(wrapper, 'Go to page 2')

      await search(wrapper, 'Token 30')

      expect(names(wrapper)).toEqual(['Token 30'])
      expect(wrapper.find('.v-pagination__item--is-active').text()).toBe('1')
    })

    it('returns to page 1 when the search has no results', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(tokenList(30))
      const { wrapper } = await mountTable()
      await flushPromises()
      await goToPage(wrapper, 'Go to page 2')

      await search(wrapper, 'zzz')
      expect(wrapper.find('.no-results-container').exists()).toBe(true)
      await wrapper.get('.no-results-container button').trigger('click')
      await flushPromises()

      expect(names(wrapper)[0]).toBe('Token 01')
      expect(wrapper.find('.v-pagination__item--is-active').text()).toBe('1')
    })

    it('removes the row after confirming the delete modal', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(tokenList(2))
      vi.mocked(resellerApi.deleteResellerApiToken).mockResolvedValue({ id: 1 })
      const { wrapper } = await mountTable()
      await flushPromises()
      expect(names(wrapper)).toEqual(['Token 01', 'Token 02'])

      await wrapper.findAll('[data-testid="reseller-api-token-delete"]')[0]!.trigger('click')
      await flushPromises()
      document.querySelector<HTMLInputElement>('[data-testid="reseller-api-delete-confirm"] input')!.click()
      await flushPromises()
      document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-delete-submit"]')!.click()
      await flushPromises()

      expect(resellerApi.deleteResellerApiToken).toHaveBeenCalledWith(1)
      expect(names(wrapper)).toEqual(['Token 02'])
      wrapper.unmount()
    })

    it('adds a row after creating a token from the empty state', async () => {
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue([])
      vi.mocked(resellerApi.createResellerApiToken).mockResolvedValue({
        id: 5,
        name: 'New token',
        last_used_at: null,
        created_at: '2026-10-02T10:00:00.000000Z',
        plain_text_token: '5|secret',
      })
      const { wrapper } = await mountTable()
      await flushPromises()
      expect(wrapper.find('[data-testid="reseller-api-empty"]').exists()).toBe(true)

      await wrapper.get('[data-testid="reseller-api-create-empty"]').trigger('click')
      await flushPromises()
      const input = document.querySelector<HTMLInputElement>('[data-testid="reseller-api-token-name-input"] input')!
      input.value = 'New token'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      document.querySelector<HTMLButtonElement>('[data-testid="reseller-api-create-submit"]')!.click()
      await flushPromises()

      expect(resellerApi.createResellerApiToken).toHaveBeenCalledWith('New token')
      expect(wrapper.find('[data-testid="reseller-api-empty"]').exists()).toBe(false)
      expect(names(wrapper)).toEqual(['New token'])
      wrapper.unmount()
    })

    it('renders mobile rows with the values per header and the delete button', async () => {
      setWidth(MOBILE_WIDTH)
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(TOKENS)
      const { wrapper } = await mountTable()
      await flushPromises()

      const rows = wrapper.findAll('.mobile-table-item__row')
      expect(rows.map(row => row.get('.mobile-table-item__header').text())).toEqual([
        'table.header.name',
        'table.header.last_used_at',
        'table.header.created_at',
        'table.header.actions',
      ])
      expect(rows[0]!.get('.mobile-table-item__value').text()).toBe('CI')
      expect(rows[1]!.get('.mobile-table-item__value').text()).toBe('general.never')
      expect(rows[3]!.find('[data-testid="reseller-api-token-delete"]').exists()).toBe(true)
      expect(wrapper.find('.custom-sort__item').exists()).toBe(false)
    })

    it('does not sort when the actions label of a mobile card is clicked', async () => {
      setWidth(MOBILE_WIDTH)
      vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue([
        // A sort by last_used_at (the second column) would give Alpha, Gamma, Beta.
        { id: 1, name: 'Beta', last_used_at: '2026-10-04T10:00:00.000000Z', created_at: '2026-10-01T10:00:00.000000Z' },
        { id: 2, name: 'Alpha', last_used_at: null, created_at: '2026-10-03T10:00:00.000000Z' },
        { id: 3, name: 'Gamma', last_used_at: '2026-10-02T10:00:00.000000Z', created_at: '2026-10-02T10:00:00.000000Z' },
      ])
      const { wrapper } = await mountTable()
      await flushPromises()
      const cardNames = () => wrapper.findAll('.mobile-table-item__row')
        .filter(row => row.get('.mobile-table-item__header').text() === 'table.header.name')
        .map(row => row.get('.mobile-table-item__value').text())
      expect(cardNames()).toEqual(['Alpha', 'Beta', 'Gamma'])

      const actionsLabel = wrapper.findAll('.mobile-table-item__header').find(el => el.text() === 'table.header.actions')!
      await actionsLabel.trigger('click')
      await flushPromises()

      expect(cardNames()).toEqual(['Alpha', 'Beta', 'Gamma'])
      wrapper.unmount()
    })

    // Characterization of the card markup: no parity state exists for Reseller API.
    it('renders the mobile card with the frame tr > td.w-100 > .mobile-table-item > .mobile-table-item__values', async () => {
      setWidth(MOBILE_WIDTH)
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T10:05:00Z') })
      try {
        vi.mocked(resellerApi.listResellerApiTokens).mockResolvedValue(TOKENS)
        const { wrapper } = await mountTable()
        await flushPromises()

        const row = wrapper.get('tbody tr')
        expect(row.find('td.w-100 > .mobile-table-item > .mobile-table-item__values').exists()).toBe(true)
        expect(normalizeHtml(row.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.name</div><div class="mobile-table-item__value"><div>CI</div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.last_used_at</div><div class="mobile-table-item__value"><div><span class="text-disabled font-italic">general.never</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.created_at</div><div class="mobile-table-item__value"><div><span class="mb-0 text--gray-darken1">23 days ago</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><div class=""><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text reseller-api-token-delete" aria-label="reseller.apiTokens.delete" data-testid="reseller-api-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></div></td></tr>"`)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
