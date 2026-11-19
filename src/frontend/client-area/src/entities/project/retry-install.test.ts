import { describe, expect, it, vi } from 'vitest'
import { type RetryDeps, retryInstall } from './retry-install'

function makeDeps (overrides: Partial<RetryDeps> = {}): RetryDeps {
  return {
    quickRetryImport: vi.fn().mockResolvedValue({ id: 5, via: 'quick-retry' }),
    retryInstall: vi.fn().mockResolvedValue({ id: 5, via: 'retry-install' }),
    emitItemChanged: vi.fn(),
    emitRetryWithForm: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: () => 'Boom.',
    ...overrides,
  }
}

describe('retryInstall', () => {
  it('quick-retries an import and reports the changed instance', async () => {
    const deps = makeDeps()

    await expect(retryInstall({ id: 5, import_details: { steps: {} } }, deps)).resolves.toBe('import')

    expect(deps.quickRetryImport).toHaveBeenCalledExactlyOnceWith(5)
    expect(deps.retryInstall).not.toHaveBeenCalled()
    expect(deps.emitItemChanged).toHaveBeenCalledExactlyOnceWith({ id: 5, via: 'quick-retry' })
  })

  it('retries a non-standard install with its install_details as the body', async () => {
    const deps = makeDeps()
    const details = { install_method: 'zip', archive: 'a.zip' }

    await expect(retryInstall({ id: 5, import_details: null, install_details: details }, deps)).resolves.toBe('install')

    expect(deps.retryInstall).toHaveBeenCalledExactlyOnceWith(5, details)
    expect(deps.emitItemChanged).toHaveBeenCalledExactlyOnceWith({ id: 5, via: 'retry-install' })
    expect(deps.emitRetryWithForm).not.toHaveBeenCalled()
  })

  it('hands a standard install to the onboarding form and sends no request (S-51)', async () => {
    const deps = makeDeps()
    const instance = { id: 5, import_details: null, install_details: { install_method: 'standard' } }

    await expect(retryInstall(instance, deps)).resolves.toBe('standard')

    expect(deps.emitRetryWithForm).toHaveBeenCalledExactlyOnceWith(instance)
    expect(deps.retryInstall).not.toHaveBeenCalled()
    expect(deps.quickRetryImport).not.toHaveBeenCalled()
  })

  it('hands an advanced install to the onboarding form too (LITE :2060-2065), so the list and the import modal open it as well', async () => {
    const deps = makeDeps()
    const instance = { id: 5, import_details: null, install_details: { install_method: 'advanced' } }

    await expect(retryInstall(instance, deps)).resolves.toBe('standard')

    expect(deps.emitRetryWithForm).toHaveBeenCalledExactlyOnceWith(instance)
    expect(deps.retryInstall).not.toHaveBeenCalled()
  })

  it('shows the API error of either request as an alert and reports `error`', async () => {
    const importDeps = makeDeps({ quickRetryImport: vi.fn().mockRejectedValue(new Error('x')) })
    await expect(retryInstall({ id: 5, import_details: {} }, importDeps)).resolves.toBe('error')
    expect(importDeps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('Boom.')
    expect(importDeps.emitItemChanged).not.toHaveBeenCalled()

    const installDeps = makeDeps({ retryInstall: vi.fn().mockRejectedValue(new Error('x')) })
    await expect(retryInstall({ id: 5, import_details: null, install_details: { install_method: 'zip' } }, installDeps)).resolves.toBe('error')
    expect(installDeps.addErrorAlert).toHaveBeenCalledExactlyOnceWith('Boom.')
  })

  it('sends one install retry at a time (legacy `submitting`)', async () => {
    let release: (value: Record<string, unknown>) => void = () => undefined
    const pending = new Promise<Record<string, unknown>>(resolve => {
      release = resolve
    })
    const deps = makeDeps({ retryInstall: vi.fn().mockReturnValue(pending) })
    const instance = { id: 5, import_details: null, install_details: { install_method: 'zip' } }

    const first = retryInstall(instance, deps)
    await retryInstall(instance, deps)
    release({ id: 5 })
    await first

    expect(deps.retryInstall).toHaveBeenCalledOnce()
  })
})
