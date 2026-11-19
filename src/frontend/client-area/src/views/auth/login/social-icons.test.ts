import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { preloadSocialIcons } from '@/shared/ui/icons/socials/lazy-socials'
import { preloadProviderIcons, withProviderIcons } from './social-icons'

vi.mock('@/shared/ui/icons/socials/lazy-socials', () => ({
  preloadSocialIcons: vi.fn(() => Promise.resolve()),
}))

describe('social icon preload for the session screens', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(preloadSocialIcons).mockClear()
  })

  it('preloads the providers of /home', async () => {
    useSessionStore().home = { app: { integrations: { auth: ['google', 'github'] } } } as never

    await preloadProviderIcons()

    expect(preloadSocialIcons).toHaveBeenCalledWith(['google', 'github'])
  })

  it('preloads nothing before /home is known or when the list is not an array', async () => {
    await preloadProviderIcons()
    useSessionStore().home = { app: { integrations: { auth: null } } } as never
    await preloadProviderIcons()

    expect(vi.mocked(preloadSocialIcons).mock.calls).toEqual([[[]], [[]]])
  })

  it('still resolves to the view when the preload throws', async () => {
    vi.mocked(preloadSocialIcons).mockRejectedValueOnce(new Error('chunk gone'))

    await expect(withProviderIcons(Promise.resolve({ default: 'view' }))).resolves.toEqual({ default: 'view' })
  })

  it('still resolves to the view when there is no active Pinia', async () => {
    setActivePinia(undefined)

    await expect(withProviderIcons(Promise.resolve({ default: 'view' }))).resolves.toEqual({ default: 'view' })
  })

  it('rejects when the view itself fails (the router reports it)', async () => {
    await expect(withProviderIcons(Promise.reject(new TypeError('Failed to fetch dynamically imported module')))).rejects.toThrow('Failed to fetch')
  })

  it('resolves to the view only after the logos are in', async () => {
    useSessionStore().home = { app: { integrations: { auth: ['github'] } } } as never
    let release: () => void = () => {}
    vi.mocked(preloadSocialIcons).mockReturnValueOnce(new Promise<void>(resolve => {
      release = resolve
    }))

    let settled = false
    const loaded = withProviderIcons(Promise.resolve({ default: 'view' })).then(view => {
      settled = true
      return view
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    release()
    await expect(loaded).resolves.toEqual({ default: 'view' })
  })
})
