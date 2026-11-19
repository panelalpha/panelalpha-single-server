import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { hasActiveToken as anyActiveToken } from '@/entities/mcp/mcp-tokens'
import { listTokens, type McpToken } from '@/entities/mcp/mcp.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'

/**
 * The token list that legacy `ConnectAi.vue` (`hasActiveToken`) and `McpTokensSection.vue` (the table) each fetched on
 * their own. One state, one `GET /mcp-tokens` per mount and per mutation.
 */
export const useConnectAiStore = defineStore('connect-ai', () => {
  const alerts = useAlertsStore()

  const tokens = ref<McpToken[]>([])
  const loading = ref(false)

  const hasActiveToken = computed(() => anyActiveToken(tokens.value))

  // The frame's silent fetch, the section's alerting fetch and the refetch after a mutation can overlap; legacy kept a
  // list per component, here only the latest request may write `tokens` / `loading`.
  let latestRequest = 0

  /**
   * `alertOnError` is the tokens section's fetch (an alert, the list stays as it was). Without it:
   * a failure is swallowed and no active token is known (`tokens` reset to `[]`).
   */
  async function fetchTokens ({ alertOnError = false }: { alertOnError?: boolean } = {}): Promise<void> {
    const request = ++latestRequest
    loading.value = true
    try {
      const fetched = await listTokens()
      if (request === latestRequest) {
        tokens.value = fetched
      }
    } catch (error) {
      if (alertOnError) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      } else if (request === latestRequest) {
        tokens.value = []
      }
    } finally {
      if (request === latestRequest) {
        loading.value = false
      }
    }
  }

  return { tokens, loading, hasActiveToken, fetchTokens }
})
