import type { WoocommerceDeps } from './instance-woocommerce'
import { describe, expect, it, vi } from 'vitest'
import { buildInstallWoocommerceModal, runInstallWoocommerce, runWoocommerceUpdate } from './instance-woocommerce'

const t = (key: string) => key

function deps (overrides: Partial<WoocommerceDeps> = {}): WoocommerceDeps {
  return {
    installWoocommerce: vi.fn(async () => undefined),
    updateWoocommerce: vi.fn(async () => undefined),
    setInstalling: vi.fn(),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: String,
    t,
    ...overrides,
  }
}

describe('buildInstallWoocommerceModal', () => {
  it('opens the install dialog with the install button before cancel, as legacy showInstallWoocommerceModal', () => {
    const modal = buildInstallWoocommerceModal(t)

    expect(modal.type).toBe('install-woocommerce')
    expect(modal.props.title).toBe('heading.instance.woocommerce.title')
    expect(modal.props.message).toBe('heading.instance.woocommerce.message')
    expect(modal.props.buttons.map(button => button.id)).toEqual(['submit', 'cancel'])
    expect(modal.props.buttons[0]).toMatchObject({ label: 'button.install', color: 'primary' })
    expect(modal.fields).toEqual([])
  })
})

describe('runInstallWoocommerce', () => {
  it('posts the install for the instance and alerts that it started', async () => {
    const d = deps()

    expect(await runInstallWoocommerce({ id: 12 }, d)).toBe('success')
    expect(d.installWoocommerce).toHaveBeenCalledWith(12)
    // The POST only queues the job: the alert must not say the plugin is installed.
    expect(d.addSuccessAlert).toHaveBeenCalledWith('notification.instance.plugin.install.success')
    expect(d.addSuccessAlert).not.toHaveBeenCalledWith('notification.instance.modal.woocommerce.install.success')
    expect(d.addErrorAlert).not.toHaveBeenCalled()
  })

  it('shows the install as running once the request is accepted, because the panel only queues it', async () => {
    const d = deps()

    expect(await runInstallWoocommerce({ id: 12 }, d)).toBe('success')

    expect(d.setInstalling).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('alerts the error and reports it, so the dialog stays open', async () => {
    const d = deps({ installWoocommerce: vi.fn(async () => {
      throw new Error('boom')
    }) })

    expect(await runInstallWoocommerce({ id: 12 }, d)).toBe('error')
    expect(d.addErrorAlert).toHaveBeenCalledWith('Error: boom')
    expect(d.addSuccessAlert).not.toHaveBeenCalled()
  })

  it('takes the install back out of its running state when the request is refused', async () => {
    const d = deps({ installWoocommerce: vi.fn(async () => {
      throw new Error('boom')
    }) })

    expect(await runInstallWoocommerce({ id: 12 }, d)).toBe('error')
    expect(d.setInstalling).toHaveBeenLastCalledWith(false)
  })
})

describe('runWoocommerceUpdate', () => {
  it('puts the update for the instance with no body and alerts success for one plugin', async () => {
    const d = deps()

    expect(await runWoocommerceUpdate({ id: 7 }, d)).toBe('success')
    expect(d.updateWoocommerce).toHaveBeenCalledWith(7)
    expect(d.addSuccessAlert).toHaveBeenCalledWith('notification.instance.plugin.update.success')
  })

  it('alerts the error and reports it when the update fails', async () => {
    const d = deps({ updateWoocommerce: vi.fn(async () => {
      throw new Error('down')
    }) })

    expect(await runWoocommerceUpdate({ id: 7 }, d)).toBe('error')
    expect(d.addErrorAlert).toHaveBeenCalledWith('Error: down')
    expect(d.addSuccessAlert).not.toHaveBeenCalled()
  })
})
