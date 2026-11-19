import type { EnvFileContents, EnvFileMeta } from './env-file.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/shared/ui/modal/dialog-shell.fixtures'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import * as envFileApi from './env-file.api'
import EnvFileView from './EnvFileView.vue'
import EnvVarsTable from './EnvVarsTable.vue'

vi.mock('./env-file.api', () => ({
  getEnvFileMeta: vi.fn(),
  getEnvFile: vi.fn(),
  putEnvFile: vi.fn(),
}))

const HOSTING_ID = 77
const INSTANCE_ID = 9
const ENV_PATH = '/var/www/app/.env'

const META: EnvFileMeta = {
  is_git_repo: false,
  is_dind: false,
  supports_restart: true,
  default_env_dir: '/var/www/app',
  default_env_path: ENV_PATH,
  app_type: 'node',
}

const FILE: EnvFileContents = {
  path: ENV_PATH,
  exists: true,
  contents: 'APP_ENV=production\nAPP_KEY=\n',
  parsed: [
    { type: 'variable', key: 'APP_ENV', value: 'production' },
    { type: 'variable', key: 'APP_KEY', value: '' },
  ],
}

const LOAD_ERROR_KEY = 'heading.instance.advanced.envFile.loadError'
const WORDPRESS_KEY = 'heading.instance.advanced.envFile.wordpressNotice'

function makeInstance (): InstanceResource {
  return {
    id: INSTANCE_ID,
    hostingId: HOSTING_ID,
    type: 'node',
  } as unknown as InstanceResource
}

// The view reads the File Manager path from the route (`/projects/:id/advanced/env-file`), so the mount carries a router.
async function mountView (instance: InstanceResource = makeInstance(), path = `/projects/${INSTANCE_ID}/advanced/env-file`) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:id/advanced/env-file', component: { render: () => null } }, { path: '/:pathMatch(.*)*', component: { render: () => null } }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(EnvFileView, { props: { instance }, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

// Characterization of the card markup: the DOM of a row stays as it was written by hand.

describe('EnvFileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue(META)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue(FILE)
  })

  it('reads the meta, then the default path, and lists the variables in the table', async () => {
    const { wrapper } = await mountView()

    expect(envFileApi.getEnvFileMeta).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID)
    expect(envFileApi.getEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, ENV_PATH)
    const table = wrapper.findComponent(EnvVarsTable)
    expect(table.exists()).toBe(true)
    expect(table.props('items')).toHaveLength(2)
    expect(wrapper.text()).toContain('APP_ENV')
  })

  it('shows a value as plain text, without a mask or an eye, and the dash for an empty value', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('.env-value__text').text()).toBe('production')
    expect(wrapper.findAll('.env-value__text')[1]!.text()).toBe('---')
    expect(wrapper.find('.env-value .v-btn').exists()).toBe(false)
  })

  it('lists a multi-line quoted value as a readonly row with no Edit or Delete', async () => {
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({
      path: ENV_PATH,
      exists: true,
      contents: 'APP_ENV=production\nNOTES="first\nsecond"\n',
      parsed: [],
    })
    const { wrapper } = await mountView()

    const table = wrapper.findComponent(EnvVarsTable)
    expect(table.props('items')).toHaveLength(2)
    expect(table.props('items')[1]).toMatchObject({ key: 'NOTES', readonly: true })
    // Only the editable row has action buttons: one Edit and one Delete. The kit renders an empty `.actions-row` for the readonly row.
    expect(wrapper.findAll('.actions-row .v-btn')).toHaveLength(2)
  })

  it('shows Import and Add only when there are rows', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="env-import"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-add"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-search"]').exists()).toBe(true)
  })

  it('filters the rows by key, shows the no-results state for a phrase with no match, and clears it', async () => {
    // The search is a 300 ms debounce, then the table filters on the `key` column only.
    vi.useFakeTimers()
    try {
      const { wrapper } = await mountView()
      const search = wrapper.find('[data-testid="env-search"] input')

      await search.setValue('zzz-no-such-key')
      vi.advanceTimersByTime(300)
      await flushPromises()

      expect(wrapper.findComponent(EnvVarsTable).props('searchTerm')).toBe('zzz-no-such-key')
      expect(wrapper.find('.no-results-container').exists()).toBe(true)
      expect(wrapper.find('.env-value__text').exists()).toBe(false)

      await wrapper.find('.no-results-container .v-btn').trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(EnvVarsTable).props('searchTerm')).toBe('')
      expect(wrapper.find('.no-results-container').exists()).toBe(false)
      expect(wrapper.findAll('.env-value__text')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('searches the key only: a phrase that is a value finds no row', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await mountView()
      const search = wrapper.find('[data-testid="env-search"] input')

      // `production` is the value of APP_ENV: the value column is not searched (legacy `filterable: false`).
      await search.setValue('production')
      vi.advanceTimersByTime(300)
      await flushPromises()
      expect(wrapper.find('.no-results-container').exists()).toBe(true)

      await search.setValue('APP_KEY')
      vi.advanceTimersByTime(300)
      await flushPromises()
      expect(wrapper.findAll('.env-value__text')).toHaveLength(1)
      expect(wrapper.find('.no-results-container').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the header buttons and the search when the file has no variables', async () => {
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ path: ENV_PATH, exists: true, contents: '# only a comment\n', parsed: [] })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="env-import"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-search"]').exists()).toBe(false)
  })

  it('shows the empty state with Import and Add in its action slot when the file is empty', async () => {
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ path: ENV_PATH, exists: true, contents: '', parsed: [] })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="env-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('heading.instance.advanced.envFile.empty.title')
    expect(wrapper.find('.no-data__action [data-testid="env-empty-import"]').exists()).toBe(true)
    expect(wrapper.find('.no-data__action [data-testid="env-empty-add"]').exists()).toBe(true)
  })

  it('opens the Add modal from the Add button of the empty state', async () => {
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ path: ENV_PATH, exists: true, contents: '', parsed: [] })
    const { wrapper } = await mountView()

    await wrapper.get('[data-testid="env-empty-add"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(BasicModal).props('title')).toBe('heading.instance.advanced.envFile.modal.add.title')
  })

  it('opens the Import modal from the Import button of the empty state', async () => {
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ path: ENV_PATH, exists: true, contents: '', parsed: [] })
    const { wrapper } = await mountView()

    await wrapper.get('[data-testid="env-empty-import"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(BasicModal).props('title')).toBe('heading.instance.advanced.envFile.modal.import.title')
  })

  it('shows the same empty state without reading a file when the instance has no default path', async () => {
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue({ ...META, default_env_path: null })
    const { wrapper } = await mountView()

    expect(envFileApi.getEnvFile).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="env-empty"]').exists()).toBe(true)
    expect(wrapper.find('.no-data__action [data-testid="env-empty-import"]').exists()).toBe(true)
    expect(wrapper.find('.no-data__action [data-testid="env-empty-add"]').exists()).toBe(true)
  })

  it('shows the WordPress notice and does not read the file', async () => {
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue({ ...META, app_type: 'wordpress' })
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain(WORDPRESS_KEY)
    expect(wrapper.findComponent(EnvVarsTable).exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-search"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-import"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-add"]').exists()).toBe(false)
    expect(envFileApi.getEnvFile).not.toHaveBeenCalled()
  })

  it('does not read a file when the instance has no default path', async () => {
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue({ ...META, default_env_path: null })
    const { wrapper } = await mountView()

    expect(envFileApi.getEnvFile).not.toHaveBeenCalled()
    expect(wrapper.findComponent(EnvVarsTable).props('items')).toEqual([])
  })

  it('shows the table skeleton and no header controls while the meta is loading', async () => {
    vi.mocked(envFileApi.getEnvFileMeta).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView()

    expect(wrapper.findComponent(EnvVarsTable).props('itemsLoading')).toBe(true)
    expect(wrapper.find('[data-testid="env-vars-table"] .v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-import"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-search"]').exists()).toBe(false)
    expect(envFileApi.getEnvFile).not.toHaveBeenCalled()
  })

  it('keeps the skeleton and no header controls while the file is loading', async () => {
    vi.mocked(envFileApi.getEnvFile).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView()

    expect(wrapper.findComponent(EnvVarsTable).props('itemsLoading')).toBe(true)
    expect(wrapper.find('[data-testid="env-vars-table"] .v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-import"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="env-add"]').exists()).toBe(false)
  })

  it('alerts with the load error and the message when the meta request fails', async () => {
    const error = new Error('meta boom')
    vi.mocked(envFileApi.getEnvFileMeta).mockRejectedValue(error)
    const { alerts } = await mountView()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({
      success: false,
      errorMessage: `${LOAD_ERROR_KEY} ${getErrorMessage(error)}`,
    })
    expect(envFileApi.getEnvFile).not.toHaveBeenCalled()
  })

  it('alerts with the same load error when the file request fails', async () => {
    const error = new Error('file boom')
    vi.mocked(envFileApi.getEnvFile).mockRejectedValue(error)
    const { alerts } = await mountView()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({
      success: false,
      errorMessage: `${LOAD_ERROR_KEY} ${getErrorMessage(error)}`,
    })
  })
})

describe('EnvFileView Add modal', () => {
  const ADD_KEY = 'heading.instance.advanced.envFile.modal.add.title'
  const SAVED = 'heading.instance.advanced.envFile.saved'
  const RESTARTED = 'heading.instance.advanced.envFile.restarted'
  const STALE = 'heading.instance.advanced.envFile.staleError'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue(META)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue(FILE)
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: true })
  })

  /** The header Add button opens the dialog; the modal is the first `BasicModal` of the tree. */
  async function openAdd (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    await wrapper.get('[data-testid="env-add"]').trigger('click')
    await flushPromises()
    return wrapper.findComponent(BasicModal)
  }

  async function setField (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string, value: unknown): Promise<void> {
    const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!
    field.vm.$emit('update:modelValue', value)
    // The field re-renders with the new value before the form validates (the Save click reads the rendered input).
    await flushPromises()
  }

  /** The first action button of the modal is Save (`save` is listed before Cancel). */
  async function clickSave (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): Promise<void> {
    await modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
    await flushPromises()
  }

  it('opens the dialog with the key and value fields and the restart checkbox', async () => {
    const { wrapper } = await mountView()
    const modal = await openAdd(wrapper)

    expect(modal.props('title')).toBe(ADD_KEY)
    expect(wrapper.findAllComponents(BasicModalField).map(item => item.props('field').name)).toEqual(['key', 'value', 'restart'])
  })

  it('PUTs the whole file with the new line and the restart flag, then alerts the restart', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', 'NEW_KEY')
    await setField(wrapper, 'value', 'x')
    await setField(wrapper, 'restart', true)

    await clickSave(modal)

    expect(envFileApi.putEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, {
      path: ENV_PATH,
      mode: 'raw',
      contents: 'APP_ENV=production\nAPP_KEY=\nNEW_KEY=x\n',
      restart: true,
    })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: RESTARTED })
  })

  it('applies the saved variable by default: a save without touching the restart box sends restart true', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', 'NEW_KEY')
    await setField(wrapper, 'value', 'x')

    await clickSave(modal)

    // The dialog's restart box starts checked, so the Engine's env-vars apply delivers the value at once.
    expect(vi.mocked(envFileApi.putEnvFile).mock.calls[0]![2]).toMatchObject({ restart: true })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: RESTARTED })
  })

  it('sends restart false when the restart box is cleared, and alerts the save', async () => {
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: false })
    const { wrapper, alerts } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', 'NEW_KEY')
    await setField(wrapper, 'value', 'x')
    await setField(wrapper, 'restart', false)

    await clickSave(modal)

    expect(vi.mocked(envFileApi.putEnvFile).mock.calls[0]![2]).toMatchObject({ restart: false })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: SAVED })
  })

  it('does not write when the file changed since it was read (staleError), and reloads', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', 'NEW_KEY')
    await setField(wrapper, 'value', 'x')
    // Someone else wrote the file after the page read it: the fresh read differs from the snapshot.
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ ...FILE, contents: 'OTHER=1\n' })

    await clickSave(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: STALE })
    expect(envFileApi.getEnvFile).toHaveBeenCalledTimes(3)
  })

  it('alerts the save error with the message and keeps no success alert', async () => {
    const error = new Error('put boom')
    vi.mocked(envFileApi.putEnvFile).mockRejectedValue(error)
    const { wrapper, alerts } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', 'NEW_KEY')
    await setField(wrapper, 'value', 'x')

    await clickSave(modal)

    expect(alerts.activeAlerts.at(-1)).toMatchObject({
      success: false,
      errorMessage: `heading.instance.advanced.envFile.saveError ${getErrorMessage(error)}`,
    })
  })

  it('keeps the modal open after a refused save, with the Save button back out of loading', async () => {
    vi.mocked(envFileApi.putEnvFile).mockRejectedValue(new Error('put boom'))
    const { wrapper } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', 'NEW_KEY')
    await setField(wrapper, 'value', 'x')

    await clickSave(modal)

    const still = wrapper.findComponent(BasicModal)
    expect(still.exists()).toBe(true)
    expect(still.props('title')).toBe(ADD_KEY)
    expect(still.props('submitting')).toBe(false)
  })

  it('does not write an invalid key (1BAD): the form rejects it before any request', async () => {
    const { wrapper } = await mountView()
    const modal = await openAdd(wrapper)
    await setField(wrapper, 'key', '1BAD')

    await clickSave(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
    expect(envFileApi.getEnvFile).toHaveBeenCalledTimes(1)
  })

  it('shows the File Manager link of the same project when the server cannot restart', async () => {
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue({ ...META, supports_restart: false })
    const { wrapper } = await mountView()
    const modal = await openAdd(wrapper)

    expect(wrapper.findAllComponents(BasicModalField).map(item => item.props('field').name)).toEqual(['key', 'value'])
    expect(modal.props('affixLink')).toEqual({
      message: 'heading.instance.advanced.envFile.fileManagerHint',
      url: `/projects/${INSTANCE_ID}/advanced/file-manager`,
    })
  })
})

describe('EnvFileView Edit modal', () => {
  const EDIT_KEY = 'heading.instance.advanced.envFile.modal.edit.title'
  const SAVED = 'heading.instance.advanced.envFile.saved'
  const STALE = 'heading.instance.advanced.envFile.staleError'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue(META)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue(FILE)
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: false })
  })

  /** The Edit button of the first row (`.actions-row`, the first button; Delete is the second). */
  async function openEdit (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    await wrapper.find('.actions-row .v-btn').trigger('click')
    await flushPromises()
    return wrapper.findComponent(BasicModal)
  }

  async function setField (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string, value: unknown): Promise<void> {
    const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!
    field.vm.$emit('update:modelValue', value)
    await flushPromises()
  }

  async function clickSave (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): Promise<void> {
    await modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
    await flushPromises()
  }

  it('opens the dialog with the row key and value in the fields, and the restart checkbox', async () => {
    const { wrapper } = await mountView()
    const modal = await openEdit(wrapper)

    expect(modal.props('title')).toBe(EDIT_KEY)
    const fields = wrapper.findAllComponents(BasicModalField)
    expect(fields.map(item => item.props('field').name)).toEqual(['key', 'value', 'restart'])
    expect(fields[0]!.props('modelValue')).toBe('APP_ENV')
    expect(fields[1]!.props('modelValue')).toBe('production')
  })

  it('PUTs the whole file with the row line rewritten and the restart flag', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openEdit(wrapper)
    await setField(wrapper, 'value', 'staging')
    await setField(wrapper, 'restart', true)

    await clickSave(modal)

    expect(envFileApi.putEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, {
      path: ENV_PATH,
      mode: 'raw',
      contents: 'APP_ENV=staging\nAPP_KEY=\n',
      restart: true,
    })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: SAVED })
  })

  it('keeps an unchanged key that the file already holds twice (its own line is not a clash)', async () => {
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ ...FILE, contents: 'APP_ENV=production\nAPP_ENV=dev\n' })
    const { wrapper } = await mountView()
    const modal = await openEdit(wrapper)
    await setField(wrapper, 'value', 'staging')

    await clickSave(modal)

    expect(envFileApi.putEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, expect.objectContaining({
      contents: 'APP_ENV=staging\nAPP_ENV=dev\n',
    }))
  })

  it('rejects a key that another line of the file already has, and sends no request', async () => {
    const { wrapper } = await mountView()
    const modal = await openEdit(wrapper)
    await setField(wrapper, 'key', 'APP_KEY')

    await clickSave(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
  })

  it('does not write when the file changed since it was read (staleError), and reloads', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openEdit(wrapper)
    await setField(wrapper, 'value', 'staging')
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ ...FILE, contents: 'OTHER=1\n' })

    await clickSave(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: STALE })
    expect(envFileApi.getEnvFile).toHaveBeenCalledTimes(3)
  })
})

describe('EnvFileView Delete modal', () => {
  const DELETE_TITLE = 'heading.instance.advanced.envFile.modal.delete.title'
  const DELETE_MESSAGE = 'heading.instance.advanced.envFile.modal.delete.message'
  const SAVED = 'heading.instance.advanced.envFile.saved'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue(META)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue(FILE)
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: false })
  })

  /** The Delete button of the first row (`.actions-row`, the second button; Edit is the first). */
  async function openDelete (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    await wrapper.findAll('.actions-row .v-btn')[1]!.trigger('click')
    await flushPromises()
    return wrapper.findComponent(BasicModal)
  }

  async function setConfirm (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], value: boolean): Promise<void> {
    const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === 'confirm')!
    field.vm.$emit('update:modelValue', value)
    await flushPromises()
  }

  async function setRestart (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], value: boolean): Promise<void> {
    const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === 'restart')!
    field.vm.$emit('update:modelValue', value)
    await flushPromises()
  }

  async function clickDelete (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): Promise<void> {
    await modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
    await flushPromises()
  }

  it('opens the dialog with the row key in the message, the confirm checkbox and the restart checkbox', async () => {
    const { wrapper } = await mountView()
    const modal = await openDelete(wrapper)

    expect(modal.props('title')).toBe(DELETE_TITLE)
    expect(modal.props('message')).toBe(DELETE_MESSAGE)
    expect(wrapper.findAllComponents(BasicModalField).map(item => item.props('field').name)).toEqual(['confirm', 'restart'])
  })

  it('keeps Delete disabled until the confirm checkbox is ticked', async () => {
    const { wrapper } = await mountView()
    const modal = await openDelete(wrapper)

    expect(modal.props('confirmRequired')).toBe(true)
    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeDefined()

    await setConfirm(wrapper, true)

    expect(modal.findAll('.v-card-actions .v-btn')[0]!.attributes('disabled')).toBeUndefined()
  })

  it('PUTs the whole file without the row line once the checkbox is ticked, then alerts the save', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openDelete(wrapper)
    await setConfirm(wrapper, true)
    // The restart box starts checked; clearing it stores the change for the next deploy instead.
    await setRestart(wrapper, false)

    await clickDelete(modal)

    expect(envFileApi.putEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, {
      path: ENV_PATH,
      mode: 'raw',
      contents: 'APP_KEY=\n',
      restart: false,
    })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: SAVED })
  })

  it('removes the second row when its Delete is chosen, and leaves the first line in place', async () => {
    const { wrapper } = await mountView()
    await wrapper.findAll('.actions-row .v-btn')[3]!.trigger('click')
    await flushPromises()
    await setConfirm(wrapper, true)

    await clickDelete(wrapper.findComponent(BasicModal))

    expect(envFileApi.putEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, expect.objectContaining({
      contents: 'APP_ENV=production\n',
    }))
  })

  it('does not write when the file changed since it was read (staleError), and reloads', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openDelete(wrapper)
    await setConfirm(wrapper, true)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ ...FILE, contents: 'OTHER=1\n' })

    await clickDelete(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'heading.instance.advanced.envFile.staleError' })
    expect(envFileApi.getEnvFile).toHaveBeenCalledTimes(3)
  })
})

describe('EnvFileView Import modal', () => {
  const IMPORT_TITLE = 'heading.instance.advanced.envFile.modal.import.title'
  const IMPORTED = 'heading.instance.advanced.envFile.imported'
  const RESTARTED = 'heading.instance.advanced.envFile.restarted'
  const STALE = 'heading.instance.advanced.envFile.staleError'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue(META)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue(FILE)
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: false })
  })

  /** The header Import button opens the dialog; the modal is the first `BasicModal` of the tree. */
  async function openImport (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    await wrapper.get('[data-testid="env-import"]').trigger('click')
    await flushPromises()
    return wrapper.findComponent(BasicModal)
  }

  async function setField (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string, value: unknown): Promise<void> {
    const field = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === name)!
    field.vm.$emit('update:modelValue', value)
    await flushPromises()
  }

  /** The first action button of the modal is Import (listed before Cancel). */
  async function clickImport (modal: { findAll: (selector: string) => Array<{ trigger: (event: string) => unknown }> }): Promise<void> {
    await modal.findAll('.v-card-actions .v-btn')[0]!.trigger('click')
    await flushPromises()
  }

  it('opens the dialog with the contents textarea, the overwrite checkbox and the restart checkbox', async () => {
    const { wrapper } = await mountView()
    const modal = await openImport(wrapper)

    expect(modal.props('title')).toBe(IMPORT_TITLE)
    expect(wrapper.findAllComponents(BasicModalField).map(item => item.props('field').name)).toEqual(['contents', 'overwrite', 'restart'])
  })

  it('adds the new key and skips the existing one when overwrite is off, then alerts the counts', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openImport(wrapper)
    await setField(wrapper, 'contents', 'APP_ENV=staging\nNEW_KEY=x\n')
    // The restart box starts checked; clearing it stores the paste for the next deploy instead.
    await setField(wrapper, 'restart', false)

    await clickImport(modal)

    expect(envFileApi.putEnvFile).toHaveBeenCalledWith(HOSTING_ID, INSTANCE_ID, {
      path: ENV_PATH,
      mode: 'raw',
      contents: 'APP_ENV=production\nAPP_KEY=\nNEW_KEY=x\n',
      restart: false,
    })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: IMPORTED })
  })

  it('updates the existing key when overwrite is on', async () => {
    const { wrapper } = await mountView()
    const modal = await openImport(wrapper)
    await setField(wrapper, 'contents', 'APP_ENV=staging\n')
    await setField(wrapper, 'overwrite', true)

    await clickImport(modal)

    expect(vi.mocked(envFileApi.putEnvFile).mock.calls[0]![2]).toMatchObject({ contents: 'APP_ENV=staging\nAPP_KEY=\n' })
  })

  it('sends restart true and appends the restart alert when the server restarted', async () => {
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: true })
    const { wrapper, alerts } = await mountView()
    const modal = await openImport(wrapper)
    await setField(wrapper, 'contents', 'NEW_KEY=x\n')
    await setField(wrapper, 'restart', true)

    await clickImport(modal)

    expect(vi.mocked(envFileApi.putEnvFile).mock.calls[0]![2]).toMatchObject({ restart: true })
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: `${IMPORTED} ${RESTARTED}` })
  })

  it('rejects a paste with no KEY=value line (importEmpty) and sends no request', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openImport(wrapper)
    const alertsBefore = alerts.activeAlerts.length
    await setField(wrapper, 'contents', '')

    await clickImport(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
    expect(envFileApi.getEnvFile).toHaveBeenCalledTimes(1)
    expect(alerts.activeAlerts.length).toBe(alertsBefore)
  })

  it('does not write when the file changed since it was read (staleError), and reloads', async () => {
    const { wrapper, alerts } = await mountView()
    const modal = await openImport(wrapper)
    await setField(wrapper, 'contents', 'NEW_KEY=x\n')
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue({ ...FILE, contents: 'OTHER=1\n' })

    await clickImport(modal)

    expect(envFileApi.putEnvFile).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: STALE })
    expect(envFileApi.getEnvFile).toHaveBeenCalledTimes(3)
  })
})

// Characterization of the card markup: the DOM of a row stays as it was written by hand.
describe('EnvVarsTable mobile card', () => {
  it('renders the cards of an editable and of a read-only variable with the legacy markup', async () => {
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    try {
      setActivePinia(createPinia())
      const items = [
        { line: 1, key: 'APP_ENV', value: 'production', exported: false },
        { line: 2, key: 'APP_MULTI', value: 'a\nb', exported: false, readonly: true },
      ]
      const wrapper = await mountKit(EnvVarsTable, { props: { items } })

      const rows = wrapper.findAll('tbody tr')
      expect(normalizeHtml(rows[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.key</div><div class="mobile-table-item__value"><span class="bold p-3">APP_ENV</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.value</div><div class="mobile-table-item__value d-flex align-center"><span class="bold p-3 env-value__text">production</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.config.delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
      expect(normalizeHtml(rows[1]!.html())).toMatchInlineSnapshot(`
        "<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.key</div><div class="mobile-table-item__value"><span class="bold p-3">APP_MULTI</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.value</div><div class="mobile-table-item__value d-flex align-center"><span class="bold p-3 env-value__text">a
        b</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"></div></div></div></div></td></tr>"
      `)
      wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
    }
  })
})

// The dialog shell of the env modals (the legacy overlay before the card, the legacy transition, a click on the overlay).
describe('EnvFileView dialog shell (kit-dialog-advanced)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(envFileApi.getEnvFileMeta).mockResolvedValue(META)
    vi.mocked(envFileApi.getEnvFile).mockResolvedValue(FILE)
    vi.mocked(envFileApi.putEnvFile).mockResolvedValue({ success: true, path: ENV_PATH, restarted: false })
  })

  /** The Delete button of the first row (`.actions-row`, the second button; Edit is the first). */
  async function openDelete (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): Promise<void> {
    await wrapper.findAll('.actions-row .v-btn')[1]!.trigger('click')
    await flushPromises()
  }

  it('opens Delete after the legacy overlay, with the legacy transition, and closes it on an overlay click', async () => {
    const { wrapper } = await mountView()
    await openDelete(wrapper)

    const overlay = expectOverlayBeforeCard('[data-testid="env-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
  })

  it('ignores an overlay click while the save request runs', async () => {
    vi.mocked(envFileApi.putEnvFile).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView()
    await openDelete(wrapper)
    const confirm = wrapper.findAllComponents(BasicModalField).find(item => item.props('field').name === 'confirm')!
    confirm.vm.$emit('update:modelValue', true)
    await flushPromises()
    await wrapper.findComponent(BasicModal).findAll('.v-card-actions .v-btn')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VDialog' }).props('persistent')).toBe(true)
    await clickOverlay(expectOverlayBeforeCard('[data-testid="env-modal"]'))

    expect(openDialogs(wrapper)).toBe(1)
  })
})
