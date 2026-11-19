import type { HostingServerAccount } from '@/views/hosting/hosting.types'
import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clickOverlay, expectOverlayBeforeCard, openDialogs } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
import { getPhpMyAdminSsoUrl, listPhpMyAdminDatabases } from '@/entities/sso/phpmyadmin-sso.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { formatBytes } from '@/shared/format/format-bytes'
import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import * as databasesApi from './databases.api'
import DatabasesView from './DatabasesView.vue'

vi.mock('./databases.api', () => ({
  listDatabases: vi.fn(),
  listUsers: vi.fn(),
  createDatabase: vi.fn(),
  renameDatabase: vi.fn(),
  deleteDatabase: vi.fn(),
  listDatabasesCached: vi.fn(),
  getServerInfo: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getPrivileges: vi.fn(),
  updatePrivileges: vi.fn(),
}))

vi.mock('@/entities/sso/phpmyadmin-sso.api', () => ({
  getPhpMyAdminSsoUrl: vi.fn(),
  getPhpMyAdminPreviewSsoUrl: vi.fn(),
  listPhpMyAdminDatabases: vi.fn(),
}))

const MB = 1024 ** 2

const usersResponse = {
  data: [
    { user: 'example_admin', databases: ['example_shop', 'example_blog'], created_at: null, updated_at: '2026-10-01T12:00:00Z' },
    { user: 'example_reader', databases: [], created_at: null, updated_at: null },
  ],
  meta: { require_database_to_create: false, privileges_supported: true, rename_supported: true },
}

const databasesResponse = {
  data: [
    { database: 'example_shop', disk_usage: 5 * MB, created_at: null, updated_at: '2026-10-06T12:00:00Z' },
    { database: 'example_blog', disk_usage: 2 * MB, created_at: null, updated_at: null },
  ],
  meta: { actions: { rename: true } },
}

function service (overrides = {}) {
  return makeService({
    privileges: ['hosting.manage_mysql', 'hosting.phpmyadmin_sso'],
    server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: false }],
    ...overrides,
  })
}

/** An account with the database prefix, so a typed name and the listed names differ as on a real account. */
function prefixedService () {
  return service({ server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: false, mysql_db_prefix: 'example_' }] })
}

async function mountDatabases (hostingService = service()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DatabasesView, { props: { service: hostingService }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

function tabTestIds (wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-testid^="databases-tab-"]').map(tab => tab.attributes('data-testid') ?? '')
}

// The dialog is teleported to the document body, so the modal is read there.
const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const bodyQueryAll = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]
const modalSubmit = () => bodyQueryAll('[data-testid="databases-modal"] .v-card-actions .v-btn')[0]!
const modalIsOpen = () => Boolean(bodyQuery('[data-testid="databases-modal"]')?.closest('.v-overlay--active'))

function typeInModal (value: string) {
  const input = bodyQuery('[data-testid="databases-modal"] input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function typeInInput (input: HTMLInputElement | undefined, value: string) {
  input!.value = value
  input!.dispatchEvent(new Event('input'))
}

async function openUsersTab (wrapper: VueWrapper) {
  await wrapper.get('[data-testid="databases-tab-users"]').trigger('click')
  await flushPromises()
}

/** Clicks the button of the open modal whose label contains `label`. */
function modalButton (label: string): HTMLElement {
  return bodyQueryAll('[data-testid="databases-modal"] .v-btn').find(button => button.textContent?.includes(label))!
}

/** The text inputs of the open modal, in field order. */
const modalInputs = () => bodyQueryAll('[data-testid="databases-modal"] input') as HTMLInputElement[]

/** The `BasicModalField` of the open modal with this field name. */
function modalField (wrapper: VueWrapper, name: string) {
  const found = wrapper.findAllComponents(BasicModalField).find(item => (item.props('field') as ModalField).name === name)
  if (!found) {
    throw new Error(`no modal field ${name}`)
  }
  return found
}

/** Changes a field the way the field component does: the model, then its `change`. */
async function changeModalField (wrapper: VueWrapper, name: string, value: unknown) {
  const field = modalField(wrapper, name)
  field.vm.$emit('update:modelValue', value)
  field.vm.$emit('change', value)
  await flushPromises()
}

describe('DatabasesView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
    vi.mocked(databasesApi.listDatabases).mockResolvedValue(databasesResponse)
    vi.mocked(databasesApi.listUsers).mockResolvedValue({
      data: [],
      meta: { require_database_to_create: false, privileges_supported: true, rename_supported: false },
    })
    vi.mocked(databasesApi.listDatabasesCached).mockResolvedValue(databasesResponse.data)
  })

  it('shows the Databases and Users tabs for hosting.manage_mysql and the PHPMyAdmin tab for the SSO privilege', async () => {
    const { wrapper } = await mountDatabases()

    expect(tabTestIds(wrapper)).toEqual(['databases-tab-databases', 'databases-tab-users', 'databases-tab-phpmyadmin'])
    wrapper.unmount()
  })

  it('keeps only the PHPMyAdmin tab without hosting.manage_mysql and loads no databases', async () => {
    const { wrapper } = await mountDatabases(service({ privileges: ['hosting.phpmyadmin_sso'] }))

    expect(tabTestIds(wrapper)).toEqual(['databases-tab-phpmyadmin'])
    expect(databasesApi.listDatabases).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows no tabs and sends no request without hosting.manage_mysql and the SSO privilege (a link to /hosting/databases)', async () => {
    // Every tab is `v-if` on its privilege.
    const { wrapper } = await mountDatabases(service({ privileges: [] }))

    expect(tabTestIds(wrapper)).toEqual([])
    expect(databasesApi.listDatabases).not.toHaveBeenCalled()
    expect(databasesApi.listUsers).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows no tabs, loads nothing and shows the diagnostic alert for a diagnostic account', async () => {
    const { wrapper, alerts } = await mountDatabases(service({ server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: true }] }))

    expect(tabTestIds(wrapper)).toEqual([])
    expect(databasesApi.listDatabases).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toContain('message.hostingAccountInDiagnosticMode')
    wrapper.unmount()
  })

  it('loads the databases once on mount and renders the rows with the formatted size and the add button', async () => {
    const { wrapper } = await mountDatabases()

    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(1)
    expect(databasesApi.listDatabases).toHaveBeenCalledWith(11)
    const rows = wrapper.findAll('.v-window-item--active .data-table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('example_shop')
    expect(rows[0]!.text()).toContain(formatBytes(5 * MB))
    expect(wrapper.get('[data-testid="databases-add"]').text()).toContain('button.database.add')
    wrapper.unmount()
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders the Edit and Delete icons of a database row with their tooltips unchanged', async () => {
    const { wrapper } = await mountDatabases()

    expect(await iconButtonsSnapshot(wrapper.get('.v-window-item--active'))).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.edit" data-testid="databases-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.database.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.delete" data-testid="databases-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.database.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.edit" data-testid="databases-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.database.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.delete" data-testid="databases-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.database.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders only the Delete icon of a database row on mobile', async () => {
    window.innerWidth = 500
    try {
      const { wrapper } = await mountDatabases()

      expect(await iconButtonsSnapshot(wrapper.get('.v-window-item--active'))).toMatchInlineSnapshot(`
        [
          {
            "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.delete" data-testid="databases-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
            "tooltip": {
              "className": "v-overlay__content",
              "html": "<span>button.database.delete</span>",
            },
          },
          {
            "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.delete" data-testid="databases-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
            "tooltip": {
              "className": "v-overlay__content",
              "html": "<span>button.database.delete</span>",
            },
          },
        ]
      `)
      wrapper.unmount()
    } finally {
      window.innerWidth = 1024
    }
  })

  it('renders the privileges, Edit, Info and Delete icons of a user row with their tooltips unchanged', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    expect(await iconButtonsSnapshot(wrapper.get('.v-window-item--active'), 'td button.v-btn--icon')).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.managePrivileges" data-testid="users-row-privileges"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.database.managePrivileges</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="users-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.showAccessDetails" data-testid="users-row-info"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.showAccessDetails</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.managePrivileges" data-testid="users-row-privileges"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.database.managePrivileges</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="users-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.showAccessDetails" data-testid="users-row-info"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.showAccessDetails</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('labels the database Edit and Delete icons and the user privileges icon with the text of their tooltips (AGENTS.md rule 1 exception, kit-button-icon)', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    const { wrapper } = await mountDatabases()

    expect(wrapper.get('[data-testid="databases-row-edit"]').attributes('aria-label')).toBe('button.database.edit')
    expect(wrapper.get('[data-testid="databases-row-delete"]').attributes('aria-label')).toBe('button.database.delete')
    await openUsersTab(wrapper)
    expect(wrapper.get('[data-testid="users-row-privileges"]').attributes('aria-label')).toBe('button.database.managePrivileges')
    // Every icon of a user row is named, not only the privileges one (a11y).
    expect(wrapper.get('[data-testid="users-row-edit"]').attributes('aria-label')).toBe('button.user.edit')
    expect(wrapper.get('[data-testid="users-row-info"]').attributes('aria-label')).toBe('button.showAccessDetails')
    expect(wrapper.get('[data-testid="users-row-delete"]').attributes('aria-label')).toBe('button.user.delete')
    wrapper.unmount()
  })

  it('renders no privileges icon in a user row when the server does not support privileges', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue({ ...usersResponse, meta: { ...usersResponse.meta, privileges_supported: false } })
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    expect(await iconButtonsSnapshot(wrapper.get('.v-window-item--active'), 'td button.v-btn--icon')).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="users-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.showAccessDetails" data-testid="users-row-info"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.showAccessDetails</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="users-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.showAccessDetails" data-testid="users-row-info"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.showAccessDetails</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.user.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('hides the filter controls while the list is empty and shows the empty state', async () => {
    vi.mocked(databasesApi.listDatabases).mockResolvedValue({ data: [], meta: { actions: { rename: true } } })
    const { wrapper } = await mountDatabases()

    expect(wrapper.get('.page-title__filter-controls').isVisible()).toBe(false)
    expect(wrapper.get('[data-testid="databases-empty"]').text()).toContain('message.emptyTable.databases.database.title')
    wrapper.unmount()
  })

  it('shows the filter controls once the list has rows', async () => {
    const { wrapper } = await mountDatabases()

    expect(wrapper.get('.page-title__filter-controls').isVisible()).toBe(true)
    expect(wrapper.find('[data-testid="databases-empty"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reloads the databases of the other account when the account selection changes', async () => {
    const accounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]
    const { wrapper } = await mountDatabases(service({ server_accounts: accounts }))

    wrapper.getComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', accounts[1])
    await flushPromises()

    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(2)
    expect(databasesApi.listDatabases).toHaveBeenLastCalledWith(12)
    wrapper.unmount()
  })

  it('drops a late answer of the previous account instead of overwriting the rows of the new one (review F3)', async () => {
    const accounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]
    let resolveFirst!: (value: typeof databasesResponse) => void
    const secondResponse = { data: [{ database: 'second_db', disk_usage: MB, created_at: null, updated_at: null }], meta: { actions: { rename: true } } }
    vi.mocked(databasesApi.listDatabases).mockImplementation(accountId => accountId === 11
      ? new Promise(resolve => {
          resolveFirst = resolve
        })
      : Promise.resolve(secondResponse))
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = await mountKit(DatabasesView, { props: { service: service({ server_accounts: accounts }) }, global: { plugins: [pinia] } })
    await flushPromises()

    wrapper.getComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', accounts[1])
    await flushPromises()
    resolveFirst(databasesResponse)
    await flushPromises()

    const rows = wrapper.findAll('.v-window-item--active .data-table tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('second_db')
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not open the Access details modal when the account changed while its data loaded (review F3)', async () => {
    const accounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    let resolveInfo!: (value: { host: string, port: number }) => void
    vi.mocked(databasesApi.getServerInfo).mockReturnValue(new Promise(resolve => {
      resolveInfo = resolve
    }))
    const { wrapper } = await mountDatabases(service({ server_accounts: accounts }))
    await openUsersTab(wrapper)

    wrapper.findAll('[data-testid="users-row-info"]')[0]!.trigger('click')
    wrapper.findAll('[data-testid="users-row-info"]')[0]!.trigger('click')
    await flushPromises()
    wrapper.getComponent(ActiveServerAccountSelector).vm.$emit('update:modelValue', accounts[1])
    await flushPromises()
    resolveInfo({ host: 'db.example.com', port: 3306 })
    await flushPromises()

    expect(databasesApi.getServerInfo).toHaveBeenCalledTimes(1)
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('sends a quick double click on the submit button once (review F9)', async () => {
    vi.mocked(databasesApi.createDatabase).mockResolvedValue(undefined)
    const { wrapper } = await mountDatabases(prefixedService())

    wrapper.get('[data-testid="databases-add"]').trigger('click')
    await flushPromises()
    typeInModal('shop')
    await flushPromises()
    modalSubmit().click()
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.createDatabase).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('shows the error of a failed databases request as an alert and leaves the table loading finished', async () => {
    vi.mocked(databasesApi.listDatabases).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { wrapper, alerts } = await mountDatabases()

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error'])
    expect(wrapper.find('.data-table--loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says the databases could not be loaded instead of the empty state, and loads them again from Retry', async () => {
    vi.mocked(databasesApi.listDatabases).mockRejectedValueOnce({ response: { data: { message: 'The server did not answer in time. Please try again in a moment.' } } })
    const { wrapper } = await mountDatabases()

    expect(wrapper.get('[data-testid="databases-load-error"]').text()).toContain('The server did not answer in time.')
    expect(wrapper.find('[data-testid="databases-empty"]').exists()).toBe(false)

    await wrapper.get('[data-testid="databases-load-error"] [data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="databases-load-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="databases-empty"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says the users could not be loaded instead of their empty state', async () => {
    vi.mocked(databasesApi.listUsers).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { wrapper } = await mountDatabases()
    wrapper.get('[data-testid="databases-tab-users"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="users-load-error"]').text()).toContain('Server Error')
    expect(wrapper.find('[data-testid="users-empty"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('creates a database from the add dialog, alerts, reloads and highlights the row of the new name', async () => {
    // Highlight `prefix + name`, reload, alert, close.
    vi.mocked(databasesApi.createDatabase).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases(prefixedService())

    wrapper.get('[data-testid="databases-add"]').trigger('click')
    await flushPromises()
    typeInModal('shop')
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.createDatabase).toHaveBeenCalledWith(11, 'shop')
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.database.add.success')
    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(2)
    const shop = wrapper.findAll('.v-window-item--active .data-table tbody tr').find(row => row.text().includes('example_shop'))!
    expect(shop.classes()).toContain('highlight')
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the add dialog open and shows the error alert when the create request fails', async () => {
    vi.mocked(databasesApi.createDatabase).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { wrapper, alerts } = await mountDatabases(prefixedService())

    wrapper.get('[data-testid="databases-add"]').trigger('click')
    await flushPromises()
    typeInModal('shop')
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error'])
    expect(modalIsOpen()).toBe(true)
    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renames the database of the row: prefilled without the prefix, sent with the full name', async () => {
    vi.mocked(databasesApi.renameDatabase).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases(prefixedService())

    wrapper.findAll('[data-testid="databases-row-edit"]')[0]!.trigger('click')
    await flushPromises()
    expect((bodyQuery('[data-testid="databases-modal"] input') as HTMLInputElement).value).toBe('shop')
    typeInModal('blog')
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.renameDatabase).toHaveBeenCalledWith(11, 'example_shop', 'blog')
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.database.rename.success')
    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(2)
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('deletes the database of the row only after the confirm checkbox is ticked', async () => {
    // The submit is disabled until the checkbox is ticked.
    vi.mocked(databasesApi.deleteDatabase).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases(prefixedService())

    wrapper.findAll('[data-testid="databases-row-delete"]')[1]!.trigger('click')
    await flushPromises()
    expect((modalSubmit() as HTMLButtonElement).disabled).toBe(true)

    bodyQuery('[data-testid="databases-modal"] .checkbox input')!.click()
    await flushPromises()
    expect((modalSubmit() as HTMLButtonElement).disabled).toBe(false)
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.deleteDatabase).toHaveBeenCalledWith(11, 'example_blog')
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.database.delete.success')
    expect(databasesApi.listDatabases).toHaveBeenCalledTimes(2)
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('loads the users once on mount with the account id, next to the databases', async () => {
    const { wrapper } = await mountDatabases()

    expect(databasesApi.listUsers).toHaveBeenCalledTimes(1)
    expect(databasesApi.listUsers).toHaveBeenCalledWith(11)
    wrapper.unmount()
  })

  it('shows the users with their database buttons, the updated text and the four actions, and the add button of users', async () => {
    // Columns, `databases` slot, actions with `privileges_supported`.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    const { wrapper } = await mountDatabases()

    await openUsersTab(wrapper)

    const rows = wrapper.findAll('.v-window-item--active .data-table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('example_admin')
    expect(wrapper.findAll('[data-testid="users-row-database"]').map(button => button.text())).toEqual(['example_shop', 'example_blog'])
    for (const testId of ['users-row-privileges', 'users-row-edit', 'users-row-info', 'users-row-delete']) {
      expect(rows[0]!.find(`[data-testid="${testId}"]`).exists()).toBe(true)
    }
    expect(wrapper.get('[data-testid="databases-add"]').text()).toContain('button.user.add')
    wrapper.unmount()
  })

  it('hides the Manage Privileges action without privileges_supported', async () => {
    // Shown only with `privilegesSupported` (`v-if`).
    vi.mocked(databasesApi.listUsers).mockResolvedValue({ ...usersResponse, meta: { ...usersResponse.meta, privileges_supported: false } })
    const { wrapper } = await mountDatabases()

    await openUsersTab(wrapper)

    expect(wrapper.find('[data-testid="users-row-privileges"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="users-row-edit"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the users empty state with its own title when there are no users', async () => {
    const { wrapper } = await mountDatabases()

    await openUsersTab(wrapper)

    expect(wrapper.get('[data-testid="users-empty"]').text()).toContain('message.emptyTable.databases.users.title')
    wrapper.unmount()
  })

  it('adds a user: the database list comes from the cache, the request carries the typed name and password, then a reload and the highlight', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.createUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases(prefixedService())
    await openUsersTab(wrapper)

    wrapper.get('[data-testid="databases-add"]').trigger('click')
    await flushPromises()
    expect(databasesApi.listDatabasesCached).toHaveBeenCalledWith(11)
    typeInInput(modalInputs()[0], 'admin')
    typeInInput(modalInputs()[1], 'Secret1!')
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.createUser).toHaveBeenCalledWith(11, { name: 'admin', password: 'Secret1!' })
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.user.add.success')
    expect(databasesApi.listUsers).toHaveBeenCalledTimes(2)
    const admin = wrapper.findAll('.v-window-item--active .data-table tbody tr').find(row => row.text().includes('example_admin'))!
    expect(admin.classes()).toContain('highlight')
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the add-user dialog open and shows the error alert when the create request fails', async () => {
    vi.mocked(databasesApi.createUser).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { wrapper, alerts } = await mountDatabases(prefixedService())
    await openUsersTab(wrapper)

    wrapper.get('[data-testid="databases-add"]').trigger('click')
    await flushPromises()
    typeInInput(modalInputs()[0], 'admin')
    typeInInput(modalInputs()[1], 'Secret1!')
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error'])
    expect(modalIsOpen()).toBe(true)
    wrapper.unmount()
  })

  it('edits a user: the name without the prefix, Set New Password reveals the password, the request sends name, hiddenPassword and password', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.updateUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases(prefixedService())
    await openUsersTab(wrapper)

    wrapper.findAll('[data-testid="users-row-edit"]')[0]!.trigger('click')
    await flushPromises()
    expect(modalInputs().map(input => input.value)).toContain('admin')

    modalButton('button.password.setNew').click()
    await flushPromises()
    typeInInput(bodyQuery('[data-testid="databases-modal"] input[type="password"]:not([disabled])') as HTMLInputElement, 'Secret1!')
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.updateUser).toHaveBeenCalledWith(11, 'example_admin', { name: 'admin', hiddenPassword: null, password: 'Secret1!' })
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.user.update.success')
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('shows the host and port of the server in a list, from the server-info of the account', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getServerInfo).mockResolvedValue({ host: 'localhost', port: 3306 })
    const { wrapper } = await mountDatabases(prefixedService())
    await openUsersTab(wrapper)

    wrapper.findAll('[data-testid="users-row-info"]')[0]!.trigger('click')
    await flushPromises()

    expect(databasesApi.getServerInfo).toHaveBeenCalledWith(11)
    const list = bodyQuery('[data-testid="databases-modal"] ul')!
    expect(list.textContent).toContain('example_admin')
    expect(list.textContent).toContain('localhost')
    expect(list.textContent).toContain('3306')
    wrapper.unmount()
  })

  it('deletes a user only after the confirm checkbox is ticked, then reloads the users', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.deleteUser).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases(prefixedService())
    await openUsersTab(wrapper)

    wrapper.findAll('[data-testid="users-row-delete"]')[0]!.trigger('click')
    await flushPromises()
    expect((modalSubmit() as HTMLButtonElement).disabled).toBe(true)
    bodyQuery('[data-testid="databases-modal"] .checkbox input')!.click()
    await flushPromises()
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.deleteUser).toHaveBeenCalledWith(11, 'example_admin')
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.user.delete.success')
    expect(databasesApi.listUsers).toHaveBeenCalledTimes(2)
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('on mobile shows the user name and the actions of each row, and an action gets its row', async () => {
    // Deliberate fix of legacy: the mobile actions got no row.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    window.innerWidth = 500
    try {
      const { wrapper } = await mountDatabases(prefixedService())
      await openUsersTab(wrapper)

      const row = wrapper.findAll('.v-window-item--active tbody tr')[0]!
      expect(row.get('.mobile-table-item__value').text()).toContain('example_admin')
      expect(row.find('[data-testid="users-row-database"]').exists()).toBe(false)
      row.get('[data-testid="users-row-edit"]').trigger('click')
      await flushPromises()

      expect(modalInputs().map(input => input.value)).toContain('admin')
      wrapper.unmount()
    } finally {
      window.innerWidth = 1024
    }
  })

  it('hides the Edit button of a database row on mobile and keeps Delete (decision K, as legacy mobile)', async () => {
    window.innerWidth = 500
    try {
      const { wrapper } = await mountDatabases(prefixedService())

      const row = wrapper.findAll('.v-window-item--active tbody tr')[0]!
      expect(row.find('[data-testid="databases-row-edit"]').exists()).toBe(false)
      expect(row.find('[data-testid="databases-row-delete"]').exists()).toBe(true)
      wrapper.unmount()
    } finally {
      window.innerWidth = 1024
    }
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile cards of a database and of a user with the legacy markup', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    window.innerWidth = 500
    try {
      const { wrapper } = await mountDatabases(prefixedService())
      expect(normalizeHtml(wrapper.findAll('.v-window-item--active tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.database</div><div class="mobile-table-item__value"><span class="bold p-3">example_shop</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.size</div><div class="mobile-table-item__value"><span class="bold p-3">5 MB</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.delete" data-testid="databases-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
      await openUsersTab(wrapper)
      expect(normalizeHtml(wrapper.findAll('.v-window-item--active tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.user</div><div class="mobile-table-item__value"><span class="bold p-3">example_admin</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.database.managePrivileges" data-testid="users-row-privileges"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.edit" data-testid="users-row-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.showAccessDetails" data-testid="users-row-info"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.user.delete" data-testid="users-row-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
      wrapper.unmount()
    } finally {
      window.innerWidth = 1024
    }
  })

  it('opens the user privileges modal only after every database of the user is fetched, and selects the first database', async () => {
    // Fetch first, then the modal.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockImplementation(async (_id, _user, database) => (
      database === 'example_shop' ? ['SELECT', 'INSERT'] : ['SELECT']
    ))
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    wrapper.get('[data-testid="users-row-privileges"]').trigger('click')
    await flushPromises()

    expect(databasesApi.getPrivileges).toHaveBeenCalledWith(11, 'example_admin', 'example_shop')
    expect(databasesApi.getPrivileges).toHaveBeenCalledWith(11, 'example_admin', 'example_blog')
    expect(modalIsOpen()).toBe(true)
    expect(bodyQuery('[data-testid="databases-modal"]')?.textContent).toContain('Database Privileges:')
    expect(modalField(wrapper, 'database').props('modelValue')).toBe('example_shop')
    expect(modalField(wrapper, 'privileges_preset').props('modelValue')).toBe('custom')
    expect(modalField(wrapper, 'SELECT').props('modelValue')).toBe(true)
    expect(modalField(wrapper, 'SELECT').props('field')).toMatchObject({ hidden: false })
    wrapper.unmount()
  })

  it('opens the database privileges modal only after its privileges are fetched (R§2.2: no TypeError on a click without hover)', async () => {
    // The legacy modal opened before the fetch result was assigned.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    let answer!: (value: string[]) => void
    vi.mocked(databasesApi.getPrivileges).mockReturnValue(new Promise(resolve => {
      answer = resolve
    }))
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    wrapper.findAll('[data-testid="users-row-database"]')[0]!.trigger('click')
    await flushPromises()
    expect(modalIsOpen()).toBe(false)

    answer(['SELECT', 'UPDATE'])
    await flushPromises()

    expect(modalIsOpen()).toBe(true)
    expect(bodyQuery('[data-testid="databases-modal"]')?.textContent).toContain('heading.hosting.databases.modal.user.editPrivilege.title')
    expect(modalField(wrapper, 'UPDATE').props('modelValue')).toBe(true)
    expect(modalField(wrapper, 'INSERT').props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('opens the user privileges modal without a crash or a fetch for an account without databases and a user without any (R§2.3)', async () => {
    // Legacy threw on `databases[0].value` here.
    vi.mocked(databasesApi.listDatabases).mockResolvedValue({ data: [], meta: { actions: { rename: true } } })
    vi.mocked(databasesApi.listUsers).mockResolvedValue({
      data: [{ user: 'example_reader', databases: [], created_at: null, updated_at: null }],
      meta: { require_database_to_create: false, privileges_supported: true, rename_supported: true },
    })
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    wrapper.get('[data-testid="users-row-privileges"]').trigger('click')
    await flushPromises()

    expect(databasesApi.getPrivileges).not.toHaveBeenCalled()
    expect(modalIsOpen()).toBe(true)
    expect(modalField(wrapper, 'database').props('modelValue')).toBe('')
    wrapper.unmount()
  })

  it('follows the database select and the preset select as legacy onChange: boxes from the chosen database, boxes shown for custom only', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockImplementation(async (_id, _user, database) => (
      database === 'example_shop' ? ['SELECT', 'INSERT'] : ['SELECT']
    ))
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)
    wrapper.get('[data-testid="users-row-privileges"]').trigger('click')
    await flushPromises()

    await changeModalField(wrapper, 'database', 'example_blog')

    expect(modalField(wrapper, 'privileges_preset').props('modelValue')).toBe('read')
    expect(modalField(wrapper, 'INSERT').props('modelValue')).toBe(false)
    expect(modalField(wrapper, 'SELECT').props('modelValue')).toBe(true)
    expect(modalField(wrapper, 'SELECT').props('field')).toMatchObject({ hidden: true })

    await changeModalField(wrapper, 'privileges_preset', 'custom')

    expect(modalField(wrapper, 'SELECT').props('field')).toMatchObject({ hidden: false })
    wrapper.unmount()
  })

  it('ALL PRIVILEGES checks every box, and an unchecked privilege clears ALL PRIVILEGES', async () => {
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockResolvedValue(['SELECT'])
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)
    wrapper.findAll('[data-testid="users-row-database"]')[0]!.trigger('click')
    await flushPromises()

    await changeModalField(wrapper, 'ALL PRIVILEGES', true)
    expect(modalField(wrapper, 'UPDATE').props('modelValue')).toBe(true)

    await changeModalField(wrapper, 'SELECT', false)
    expect(modalField(wrapper, 'ALL PRIVILEGES').props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('submits the checked boxes of a custom user as a PUT, then reloads the users and highlights the user', async () => {
    // The request, the highlight, the reload.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockImplementation(async (_id, _user, database) => (
      database === 'example_shop' ? ['SELECT', 'INSERT'] : ['SELECT']
    ))
    vi.mocked(databasesApi.updatePrivileges).mockResolvedValue(undefined)
    const { wrapper, alerts } = await mountDatabases()
    await openUsersTab(wrapper)
    wrapper.get('[data-testid="users-row-privileges"]').trigger('click')
    await flushPromises()

    await changeModalField(wrapper, 'UPDATE', true)
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.updatePrivileges).toHaveBeenCalledWith(11, 'example_admin', 'example_shop', ['INSERT', 'SELECT', 'UPDATE'])
    expect(alerts.activeAlerts.map(alert => alert.successMessage)).toContain('notification.hosting.databases.user.updatePrivilege.success')
    expect(databasesApi.listUsers).toHaveBeenCalledTimes(2)
    expect(modalIsOpen()).toBe(false)
    wrapper.unmount()
  })

  it('sends an empty preset as an empty list, which the API stores as a DELETE', async () => {
    // `none` gives no privileges, so the request is a DELETE.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockResolvedValue([])
    vi.mocked(databasesApi.updatePrivileges).mockResolvedValue(undefined)
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)
    wrapper.get('[data-testid="users-row-privileges"]').trigger('click')
    await flushPromises()

    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.updatePrivileges).toHaveBeenCalledWith(11, 'example_admin', 'example_shop', [])
    wrapper.unmount()
  })

  it('submits the database modal as custom on its own database, with the boxes it shows', async () => {
    // The body is `{...formValues, privileges_preset: "custom", database: db.name}`.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockResolvedValue(['SELECT'])
    vi.mocked(databasesApi.updatePrivileges).mockResolvedValue(undefined)
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)
    wrapper.findAll('[data-testid="users-row-database"]')[1]!.trigger('click')
    await flushPromises()

    await changeModalField(wrapper, 'DELETE', true)
    modalSubmit().click()
    await flushPromises()

    expect(databasesApi.updatePrivileges).toHaveBeenCalledWith(11, 'example_admin', 'example_blog', ['DELETE', 'SELECT'])
    wrapper.unmount()
  })

  it('fetches the privileges of a database when its tooltip opens, through the cache', async () => {
    // The deep watcher of the Users items.
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.getPrivileges).mockResolvedValue(['ALL PRIVILEGES'])
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    // The Databases tab keeps its own tooltips mounted, so the tooltip of the Users database button is picked by its activator
    const tooltip = wrapper.findAllComponents({ name: 'VTooltip' }).find(item => item.findAll('[data-testid="users-row-database"]').length > 0)!
    tooltip.vm.$emit('update:modelValue', true)
    await flushPromises()

    expect(databasesApi.getPrivileges).toHaveBeenCalledWith(11, 'example_admin', 'example_shop')
    wrapper.unmount()
  })

  describe('the PHPMyAdmin tab', () => {
    beforeEach(() => {
      vi.mocked(getPhpMyAdminSsoUrl).mockResolvedValue('https://pma.example.com/sso')
    })

    it('shows the card, and its login opens the SSO URL of a non-Plesk account', async () => {
      // No host and no SSO flag: the login goes straight through, without a database.
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      const { wrapper } = await mountDatabases()

      await wrapper.get('[data-testid="databases-tab-phpmyadmin"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="phpmyadmin-card"]').exists()).toBe(true)

      await wrapper.get('[data-testid="phpmyadmin-login"]').trigger('click')
      await flushPromises()

      expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11)
      expect(open).toHaveBeenCalledWith('https://pma.example.com/sso')
      open.mockRestore()
      wrapper.unmount()
    })

    it('shows the title, the subtitle, the hint and the login label of the phpMyAdmin card', async () => {
      const { wrapper } = await mountDatabases()

      await wrapper.get('[data-testid="databases-tab-phpmyadmin"]').trigger('click')
      await flushPromises()

      const card = wrapper.get('[data-testid="phpmyadmin-card"]')
      expect(card.get('h6').text()).toBe('heading.hosting.databases.phpmyadmin.title')
      expect(card.text()).toContain('heading.hosting.databases.phpmyadmin.subtitle')
      expect(card.text()).toContain('heading.hosting.databases.phpmyadmin.alert')
      expect(wrapper.get('[data-testid="phpmyadmin-login"]').text()).toBe('button.login.phpmyadmin')
      wrapper.unmount()
    })

    it('logs a Plesk account with one database straight in with its id', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      vi.mocked(listPhpMyAdminDatabases).mockResolvedValue([{ value: 5, label: 'example_shop' }])
      const { wrapper } = await mountDatabases(service({
        server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: false, server_type: 'plesk' }],
      }))

      await wrapper.get('[data-testid="databases-tab-phpmyadmin"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="phpmyadmin-login"]').trigger('click')
      await flushPromises()

      expect(listPhpMyAdminDatabases).toHaveBeenCalledWith(11)
      expect(getPhpMyAdminSsoUrl).toHaveBeenCalledWith(11, 5)
      open.mockRestore()
      wrapper.unmount()
    })
  })

  describe('project variant', () => {
    async function mountProject (hostingService = service()) {
      const pinia = createPinia()
      setActivePinia(pinia)
      const wrapper = await mountKit(DatabasesView, { props: { service: hostingService, variant: 'project' }, global: { plugins: [pinia] } })
      await flushPromises()
      return { wrapper, alerts: useAlertsStore() }
    }

    const twoAccounts = [
      { id: 11, domain: 'example.com', diagnostic_mode: false },
      { id: 12, domain: 'second.example.com', diagnostic_mode: false },
    ]

    it('has the advanced page root, the title in the first row and the tabs in the second', async () => {
      const { wrapper } = await mountProject()

      expect(wrapper.classes()).toContain('advanced-hosting-page')
      const container = wrapper.get('.page-title.page-title--advanced')
      const rows = container.findAll(':scope > .v-row')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.get('.page-title__title-box h4.page-title__title').attributes('data-testid')).toBe('databases-title')
      expect(rows[0]!.find('[data-testid="databases-tab-databases"]').exists()).toBe(false)
      expect(rows[0]!.classes()).not.toContain('page-tab-filters-controls')
      expect(rows[1]!.get('.page-title__tabs [data-testid="databases-tab-databases"]').exists()).toBe(true)
      const filters = rows[0]!.get('.page-title__filter-controls')
      expect(filters.classes()).not.toContain('justify-end')
      expect(filters.classes()).not.toContain('align-end')
      wrapper.unmount()
    })

    it('keeps the tabs in the first row and no title in the hosting variant', async () => {
      const { wrapper } = await mountDatabases()

      expect(wrapper.classes()).not.toContain('advanced-hosting-page')
      expect(wrapper.find('[data-testid="databases-title"]').exists()).toBe(false)
      expect(wrapper.find('.page-title--advanced').exists()).toBe(false)
      const rows = wrapper.findAll('.container > .v-row')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.classes()).toContain('page-tab-filters-controls')
      expect(rows[0]!.find('[data-testid="databases-tab-databases"]').exists()).toBe(true)
      wrapper.unmount()
    })

    it('does not show the account selector even for several accounts', async () => {
      const { wrapper } = await mountProject(service({ server_accounts: twoAccounts }))

      expect(wrapper.findComponent(ActiveServerAccountSelector).exists()).toBe(false)
      expect(databasesApi.listDatabases).toHaveBeenCalledTimes(1)
      expect(databasesApi.listDatabases).toHaveBeenCalledWith(11)
      wrapper.unmount()
    })

    it('does not reload for a new service reference with the same account id', async () => {
      const { wrapper } = await mountProject()

      await wrapper.setProps({ service: service() })
      await flushPromises()

      expect(databasesApi.listDatabases).toHaveBeenCalledTimes(1)
      expect(databasesApi.listUsers).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('reloads both lists for a new account id', async () => {
      const { wrapper } = await mountProject()

      await wrapper.setProps({ service: service({ server_accounts: [{ id: 12, domain: 'two.example.com', diagnostic_mode: false }] }) })
      await flushPromises()

      expect(databasesApi.listDatabases).toHaveBeenCalledTimes(2)
      expect(databasesApi.listDatabases).toHaveBeenLastCalledWith(12)
      expect(databasesApi.listUsers).toHaveBeenCalledTimes(2)
      expect(databasesApi.listUsers).toHaveBeenLastCalledWith(12)
      wrapper.unmount()
    })

    it('makes no request and keeps the tables loading without an account id', async () => {
      const { wrapper } = await mountProject(service({
        server_accounts: [{ id: undefined, domain: 'example.com', diagnostic_mode: false } as unknown as HostingServerAccount],
      }))

      expect(databasesApi.listDatabases).not.toHaveBeenCalled()
      expect(databasesApi.listUsers).not.toHaveBeenCalled()
      expect(tabTestIds(wrapper)).toContain('databases-tab-databases')
      expect(wrapper.find('.data-table--loading').exists()).toBe(true)
      await openUsersTab(wrapper)
      expect(wrapper.find('.v-window-item--active .data-table--loading').exists()).toBe(true)
      wrapper.unmount()
    })

    it('shows the diagnostic alert and no tabs for a diagnostic account', async () => {
      const { wrapper, alerts } = await mountProject(service({ server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: true }] }))

      expect(databasesApi.listDatabases).not.toHaveBeenCalled()
      expect(tabTestIds(wrapper)).toEqual([])
      expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toContain('message.hostingAccountInDiagnosticMode')
      wrapper.unmount()
    })

    it('keeps only the phpMyAdmin tab and makes no list request with only hosting.phpmyadmin_sso', async () => {
      const { wrapper } = await mountProject(service({ privileges: ['hosting.phpmyadmin_sso'] }))

      expect(tabTestIds(wrapper)).toEqual(['databases-tab-phpmyadmin'])
      expect(databasesApi.listDatabases).not.toHaveBeenCalled()
      expect(databasesApi.listUsers).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })
  it('opens Add after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
    const { wrapper } = await mountDatabases(prefixedService())
    wrapper.get('[data-testid="databases-add"]').trigger('click')
    await flushPromises()

    const overlay = expectOverlayBeforeCard('[data-testid="databases-modal"]')
    // The phpMyAdmin SSO dialogs (entity, out of scope) come first and keep the V4 transition: only the last dialog is checked.
    expect(wrapper.findAllComponents({ name: 'VDialog' }).at(-1)!.props('transition')).toBe('custom-dialog-transition')
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
    window.innerWidth = 1600
    vi.mocked(databasesApi.listDatabases).mockResolvedValue(databasesResponse)
    vi.mocked(databasesApi.listUsers).mockResolvedValue(usersResponse)
    vi.mocked(databasesApi.listDatabasesCached).mockResolvedValue(databasesResponse.data)
  })

  afterEach(() => {
    window.innerWidth = 1024
  })

  const rowsOf = (wrapper: VueWrapper) => wrapper.findAll('.v-window-item--active tbody tr')
  const firstCells = (wrapper: VueWrapper) => rowsOf(wrapper).map(row => row.findAll('td')[0]!.text())

  it('sorts the databases by the clicked header and flips the direction on the second click', async () => {
    const { wrapper } = await mountDatabases()

    await wrapper.get('.v-window-item--active tr.custom-sort .item--database .custom-sort__item').trigger('click')
    await flushPromises()
    expect(firstCells(wrapper)).toEqual(['example_shop', 'example_blog'])

    await wrapper.get('.v-window-item--active tr.custom-sort .item--database .custom-sort__item').trigger('click')
    await flushPromises()
    expect(firstCells(wrapper)).toEqual(['example_blog', 'example_shop'])
    wrapper.unmount()
  })

  it('filters both tables by the search term and offers Clear filters when nothing matches', async () => {
    const { wrapper } = await mountDatabases()

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'blog')
    await flushPromises()
    expect(firstCells(wrapper)).toEqual(['example_blog'])

    wrapper.findComponent(DataIteratorFilterControls).vm.$emit('update:search-term', 'zzz')
    await flushPromises()
    expect(wrapper.find('.v-window-item--active .no-results-container').exists()).toBe(true)
    await wrapper.get('.v-window-item--active .no-results-container button').trigger('click')
    await flushPromises()
    expect(rowsOf(wrapper)).toHaveLength(2)
    wrapper.unmount()
  })

  it('pages the databases by 8 and moves to the second page from the footer', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ database: `db_${index + 1}`, disk_usage: MB, created_at: null, updated_at: null }))
    vi.mocked(databasesApi.listDatabases).mockResolvedValue({ data: many, meta: { actions: { rename: true } } })
    const { wrapper } = await mountDatabases()

    expect(rowsOf(wrapper)).toHaveLength(8)
    await wrapper.findAll('.v-window-item--active .v-pagination__item button')[1]!.trigger('click')
    await flushPromises()
    expect(rowsOf(wrapper)).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders the assigned databases of a user through the databases slot', async () => {
    const { wrapper } = await mountDatabases()
    await openUsersTab(wrapper)

    const rows = rowsOf(wrapper)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('example_shop')
    expect(rows[0]!.text()).toContain('example_blog')
    wrapper.unmount()
  })

  it('shows the empty message of each table in its own tab', async () => {
    vi.mocked(databasesApi.listDatabases).mockResolvedValue({ data: [], meta: { actions: { rename: true } } })
    vi.mocked(databasesApi.listUsers).mockResolvedValue({ data: [], meta: usersResponse.meta })
    const { wrapper } = await mountDatabases()

    expect(wrapper.find('[data-testid="databases-empty"]').exists()).toBe(true)
    expect(wrapper.find('.v-window-item--active tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.v-window-item--active .data-iterator-footer').exists()).toBe(false)
    await openUsersTab(wrapper)
    expect(wrapper.find('[data-testid="users-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the skeleton while the databases load and no rows', async () => {
    vi.mocked(databasesApi.listDatabases).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountDatabases()

    expect(wrapper.find('.v-window-item--active .v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="databases-row-delete"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the fields and the actions of each database and of each user in a card below 976 px', async () => {
    window.innerWidth = 500
    const { wrapper } = await mountDatabases()

    expect(wrapper.find('.v-window-item--active tr.custom-sort').exists()).toBe(false)
    let cards = wrapper.findAll('.v-window-item--active tbody tr .mobile-table-item')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.text()).toContain('example_shop')
    expect(cards[0]!.find('[data-testid="databases-row-delete"]').exists()).toBe(true)

    await openUsersTab(wrapper)
    cards = wrapper.findAll('.v-window-item--active tbody tr .mobile-table-item')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.text()).toContain('example_admin')
    expect(cards[0]!.find('[data-testid="users-row-delete"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
