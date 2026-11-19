import type { HomeResponse } from '@/shared/session/session.api'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { useDateFormat } from './use-date-format'

const OCT_5_MORNING = new Date(2026, 9, 5, 9, 7, 3)

function homeWith (defaultDateFormat?: string): HomeResponse {
  return { app: { default_date_format: defaultDateFormat } }
}

describe('useDateFormat', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('formats with the default date format of the session', () => {
    useSessionStore().home = homeWith('DD.MM.YYYY')

    expect(useDateFormat()(OCT_5_MORNING)).toBe('05.10.2026')
  })

  it('falls back to YYYY-MM-DD without a session format', () => {
    useSessionStore().home = homeWith(undefined)

    expect(useDateFormat()(OCT_5_MORNING)).toBe('2026-10-05')
  })

  it('lets an explicit format win over the session value', () => {
    useSessionStore().home = homeWith('MM/DD/YYYY')

    expect(useDateFormat()(OCT_5_MORNING, { format: 'DD/MM/YYYY' })).toBe('05/10/2026')
  })

  it('appends the time when asked', () => {
    useSessionStore().home = homeWith('MM/DD/YYYY')

    expect(useDateFormat()(OCT_5_MORNING, { time: true })).toBe('10/05/2026 09:07')
  })
})
