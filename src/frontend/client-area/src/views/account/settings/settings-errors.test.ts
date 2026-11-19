import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { loadErrorMessages, saved } from './settings-errors'

const failure = (data: unknown) => ({ response: { status: 422, data } })

describe('loadErrorMessages', () => {
  it('flattens the errors bag without the key prefix', () => {
    expect(loadErrorMessages(failure({ errors: { url: ['Bad url.'], name: ['A', 'B'] } }))).toEqual(['Bad url.', 'A', 'B'])
  })

  it('falls back to getErrorMessages without errors', () => {
    expect(loadErrorMessages(failure({ message: 'Server down' }))).toEqual(['Server down'])
  })

  it('falls back to the network message without a response', () => {
    expect(loadErrorMessages(new Error('x'))).toEqual(['Something went wrong. Please try again.'])
  })
})

describe('saved', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the success toast', () => {
    saved(key => key)
    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'settings.saved' })
  })
})
