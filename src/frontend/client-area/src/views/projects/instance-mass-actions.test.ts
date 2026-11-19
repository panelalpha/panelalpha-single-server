import { describe, expect, it, vi } from 'vitest'
import { buildMassDeleteModal, type MassActionDeps, runMassDelete } from '@/entities/project/action-modal'
import { buildUnsuspendModal, unsuspendInstance } from './instance-mass-actions'

// Raw keys as copy: `t(key, options)` becomes `key|{"count":2}` when options are given.
const t = (key: string, options?: Record<string, unknown>) => options === undefined ? key : `${key}|${JSON.stringify(options)}`

const wp = { id: 1, hostingServerType: 'cpanel' }
const wp2 = { id: 2, hostingServerType: 'cpanel' }
const cloud = { id: 3, hostingServerType: 'wp-cloud' }
const cloud2 = { id: 4, hostingServerType: 'wp-cloud' }

describe('buildMassDeleteModal', () => {
  const names = (fields: ReturnType<typeof buildMassDeleteModal>['fields']) => fields.map(field => ('name' in field ? field.name : undefined))

  it('requires both acknowledgements and the confirmation, whatever the project type', () => {
    const modal = buildMassDeleteModal([wp, cloud, { id: 5, type: 'custom' }], t)

    expect(names(modal.fields)).toEqual(['remove_data', 'remove_database', 'confirm'])
    expect(modal.props.confirmRequired).toBe(true)
    expect(modal.props.color).toBe('error')
    expect(modal.props.icon).toBe('$alertwarning')
    for (const field of modal.fields) {
      expect(field).toMatchObject({ type: 'checkbox', required: true })
    }
  })

  it('labels the boxes with what is lost, in the plural for several projects', () => {
    const one = buildMassDeleteModal([wp], t)
    const many = buildMassDeleteModal([wp, wp2], t)

    expect(one.fields[0]).toMatchObject({ name: 'remove_data', label: 'form.confirmDelete.instanceFiles_one' })
    expect(one.fields[1]).toMatchObject({ name: 'remove_database', label: 'form.confirmDelete.instanceDatabase_one' })
    expect(many.fields[0]).toMatchObject({ name: 'remove_data', label: 'form.confirmDelete.instanceFiles_other' })
    expect(many.fields[1]).toMatchObject({ name: 'remove_database', label: 'form.confirmDelete.instanceDatabase_other' })
  })

  it('keeps the wp-cloud alert next to the acknowledgements', () => {
    const modal = buildMassDeleteModal([cloud, cloud2], t)

    expect(names(modal.fields)).toEqual(['remove_data', 'remove_database', 'confirm'])
    expect(modal.props.alert).toBe('heading.instance.delete.wpCloud.alert')
  })

  it('shows the wp-cloud alert when only some items are wp-cloud', () => {
    const modal = buildMassDeleteModal([wp, cloud], t)

    expect(names(modal.fields)).toEqual(['remove_data', 'remove_database', 'confirm'])
    expect(modal.props.alert).toBe('heading.instance.delete.wpCloud.alert')
  })

  it('has no alert when no item is wp-cloud', () => {
    const modal = buildMassDeleteModal([wp, wp2], t)

    expect(modal.props.alert).toBeUndefined()
  })

  it('words the title, message and button by the number of instances', () => {
    const modal = buildMassDeleteModal([wp, wp2, cloud], t)

    expect(modal.props.title).toBe('heading.instance.delete.title|{"count":3}')
    expect(modal.props.message).toBe('heading.instance.delete.message|{"count":3}')
    expect(modal.props.buttons[0]).toMatchObject({ id: 'submit', label: 'button.deleteInstance|{"count":3}', color: 'error' })
    expect(modal.props.buttons[1]).toMatchObject({ id: 'cancel', type: 'cancel' })
    expect(modal.fields.at(-1)).toMatchObject({ label: 'form.confirmDelete.instance|{"count":1}' })
  })
})

describe('buildUnsuspendModal', () => {
  it('is persistent, narrow and sand coloured', () => {
    const modal = buildUnsuspendModal(t)

    expect(modal.persistent).toBe(true)
    expect(modal.width).toBe('360px')
    expect(modal.props.icon).toBe('$suspended')
    expect(modal.props.color).toBe('sand')
    expect(modal.props.title).toBe('heading.instance.unsuspend.title')
    expect(modal.props.message).toBe('heading.instance.unsuspend.message')
    expect(modal.props.buttons.map(button => [button.id, button.color])).toEqual([['submit', 'sand-darken-1'], ['cancel', 'normal']])
    expect(modal.fields).toEqual([])
  })

  it('opens the unsuspend link in a new tab', () => {
    const open = vi.fn()
    unsuspendInstance('https://pay.example.com', open)
    expect(open).toHaveBeenCalledWith('https://pay.example.com', '_blank')
  })
})

function makeDeps (overrides: Partial<MassActionDeps> = {}) {
  const deps = {
    clearInstanceCache: vi.fn().mockResolvedValue(undefined),
    deleteInstance: vi.fn().mockResolvedValue(undefined),
    refreshHome: vi.fn().mockResolvedValue(undefined),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) => `msg:${(error as Error).message}`),
    t,
    ...overrides,
  }
  return deps
}

describe('runMassDelete', () => {
  const values = { remove_data: true, remove_database: true, confirm: true }

  it('sends the acknowledgements to every instance, refreshes /home and alerts with the count', async () => {
    const deps = makeDeps()

    await expect(runMassDelete([wp, wp2], values, deps)).resolves.toBe('deleted')

    expect(deps.deleteInstance.mock.calls).toEqual([[1, values], [2, values]])
    expect(deps.refreshHome).toHaveBeenCalledOnce()
    expect(deps.addSuccessAlert).toHaveBeenCalledWith('notification.instance.modal.delete.success|{"count":2}')
  })

  it('sends both acknowledgements and the confirmation as true, whatever the dialog values hold', async () => {
    const deps = makeDeps()
    const untouched = { remove_data: false, remove_database: null, confirm: null }

    await expect(runMassDelete([wp], untouched, deps)).resolves.toBe('deleted')

    expect(deps.deleteInstance).toHaveBeenCalledExactlyOnceWith(1, { remove_data: true, remove_database: true, confirm: true })
    expect(untouched).toEqual({ remove_data: false, remove_database: null, confirm: null })
  })

  it('counts a 404 as success', async () => {
    const notFound = Object.assign(new Error('gone'), { response: { status: 404 } })
    const deps = makeDeps({ deleteInstance: vi.fn().mockRejectedValue(notFound) })

    await expect(runMassDelete([wp], values, deps)).resolves.toBe('deleted')

    expect(deps.refreshHome).toHaveBeenCalledOnce()
    expect(deps.addSuccessAlert).toHaveBeenCalledOnce()
    expect(deps.addErrorAlert).not.toHaveBeenCalled()
  })

  it('shows the error and does not refresh for any other failure', async () => {
    const failure = Object.assign(new Error('forbidden'), { response: { status: 403 } })
    const deps = makeDeps({ deleteInstance: vi.fn().mockRejectedValue(failure) })

    await expect(runMassDelete([wp], values, deps)).resolves.toBe('error')

    expect(deps.addErrorAlert).toHaveBeenCalledWith('msg:forbidden')
    expect(deps.addSuccessAlert).not.toHaveBeenCalled()
    expect(deps.refreshHome).not.toHaveBeenCalled()
  })

  it('treats an error without a response (network) as a failure instead of throwing', async () => {
    const deps = makeDeps({ deleteInstance: vi.fn().mockRejectedValue(new Error('Network Error')) })

    await expect(runMassDelete([wp], values, deps)).resolves.toBe('error')
    expect(deps.addErrorAlert).toHaveBeenCalledWith('msg:Network Error')
  })

  it('ignores a failing /home refresh', async () => {
    const deps = makeDeps({ refreshHome: vi.fn().mockRejectedValue(new Error('x')) })

    await expect(runMassDelete([wp], values, deps)).resolves.toBe('deleted')
  })
})
