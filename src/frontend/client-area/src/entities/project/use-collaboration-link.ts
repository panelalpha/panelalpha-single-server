import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { getCollaborationLink } from './collaboration-link.api'

// Fetch the link and open it in a new tab; a failed request shows its message as an alert.
// The chip of the card and of the table (and the sub-row of the table, with the sub-instance id) call `open` on click.

export function useCollaborationLink () {
  const alerts = useAlertsStore()

  async function open (id: number): Promise<void> {
    try {
      const url = await getCollaborationLink(id)
      if (url) {
        window.open(url, '_blank')
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  return { open }
}
