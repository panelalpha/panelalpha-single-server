import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { installWoocommerce, updateWoocommerce } from './instance-woocommerce.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

describe('instance-woocommerce.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('puts the WooCommerce update of the instance with no body', async () => {
    await updateWoocommerce(5)
    expect(api.put).toHaveBeenCalledWith('/instances/5/wordpress/plugins/woocommerce/update')
  })

  it('posts the WooCommerce install of the instance with no body', async () => {
    await installWoocommerce(5)
    expect(api.post).toHaveBeenCalledWith('/instances/5/wordpress/plugins/new/woocommerce/install')
  })

  it('does not read a plugin list from the install answer, which carries only success', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true } })
    const result = await installWoocommerce(5)

    expect(result).toBeUndefined()
    expect(api.get).not.toHaveBeenCalled()
  })
})
