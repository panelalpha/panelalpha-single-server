import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from './session.store'
import { useSingleServer } from './use-single-server'

describe('useSingleServer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is false without home', () => {
    expect(useSingleServer().value).toBe(false)
  })

  it('is false without single_server', () => {
    useSessionStore().hydrateHome({ app: {}, user: {} } as never)
    expect(useSingleServer().value).toBe(false)
  })

  it('follows single_server.active', () => {
    const session = useSessionStore()
    const single = useSingleServer()
    session.hydrateHome({ app: { single_server: { active: true } }, user: {} } as never)
    expect(single.value).toBe(true)
    session.hydrateHome({ app: { single_server: { active: false } }, user: {} } as never)
    expect(single.value).toBe(false)
  })
})
