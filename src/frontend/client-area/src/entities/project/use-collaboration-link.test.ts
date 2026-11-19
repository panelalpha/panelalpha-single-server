import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getCollaborationLink } from './collaboration-link.api'
import { useCollaborationLink } from './use-collaboration-link'

vi.mock('./collaboration-link.api', () => ({
  getCollaborationLink: vi.fn(),
}))

describe('useCollaborationLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the link for the id and opens it in a new tab', async () => {
    vi.mocked(getCollaborationLink).mockResolvedValueOnce('https://atarim.example.test/x')

    await useCollaborationLink().open(12)

    expect(getCollaborationLink).toHaveBeenCalledWith(12)
    expect(window.open).toHaveBeenCalledWith('https://atarim.example.test/x', '_blank')
  })

  it('opens nothing and shows no alert when the server sends no url', async () => {
    vi.mocked(getCollaborationLink).mockResolvedValueOnce('')
    const alerts = useAlertsStore()

    await useCollaborationLink().open(12)

    expect(window.open).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toHaveLength(0)
  })

  it('shows the error as an alert and opens nothing when the request fails', async () => {
    vi.mocked(getCollaborationLink).mockRejectedValueOnce(Object.assign(new Error('boom'), {
      response: { data: { message: 'Atarim is down' } },
    }))
    const alerts = useAlertsStore()

    await useCollaborationLink().open(12)

    expect(window.open).not.toHaveBeenCalled()
    expect(alerts.activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Atarim is down' })])
  })
})
