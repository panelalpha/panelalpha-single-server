import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from './alerts.store'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('alerts store', () => {
  it('adds an alert with an id between 1 and 1000 and keeps the payload', () => {
    const store = useAlertsStore()
    store.addAlert({ success: true, successMessage: 'Saved' })

    expect(store.activeAlerts).toHaveLength(1)
    expect(store.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'Saved' })
    expect(store.activeAlerts[0]!.id).toBeGreaterThanOrEqual(1)
    expect(store.activeAlerts[0]!.id).toBeLessThanOrEqual(1000)
  })

  it('appends in order and removes by id', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValueOnce(0.0015).mockReturnValueOnce(0.0025)
    const store = useAlertsStore()
    store.addAlert({ success: false, errorMessage: 'a' })
    store.addAlert({ success: true, successMessage: 'b' })
    expect(store.activeAlerts.map(item => item.id)).toEqual([2, 3])

    store.removeAlert(2)
    expect(store.activeAlerts.map(item => item.id)).toEqual([3])

    store.removeAlert(99)
    expect(store.activeAlerts).toHaveLength(1)
    random.mockRestore()
  })

  it('removes every alert that shares the id (legacy ids are random and can collide)', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const store = useAlertsStore()
    store.addAlert({ success: true })
    store.addAlert({ success: false })
    store.removeAlert(500)
    expect(store.activeAlerts).toEqual([])
    random.mockRestore()
  })
})
