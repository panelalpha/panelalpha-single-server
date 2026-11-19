import type { HubStatus } from '@/entities/hub/hub.api'
import type { McpToken } from '@/entities/mcp/mcp.api'
import { hasActiveToken } from '@/entities/mcp/mcp-tokens'

// Step 4 of the wizard (the single-server branch of the admin area, without the instance and integrations rows).

/** What the Summary knows about the pairing: `unknown` while `GET /community/hub` has not answered (or failed), then one of the two. */
export type SummaryHub = 'unknown' | 'connected' | 'missing'

/** A line of the Hub list. */
export interface ConnectLine {
  key: string
  defaultValue: string
}

/** What PanelAlpha Hub brings, shown after a Hub sign-in (`connectBenefitsEnabled`). After a local account the Summary lists nothing: the
 * wizard does not offer Hub then. */
export const HUB_INCLUDED_LINES: ConnectLine[] = [
  { key: 'servers', defaultValue: 'One login for all your servers' },
  { key: 'login', defaultValue: 'One-click admin login' },
  { key: 'monitoring', defaultValue: 'App monitoring across your servers' },
  { key: 'go', defaultValue: 'Verified apps from the PanelAlpha GO! catalog' },
]

/** The pairing as the Summary shows it. The source gets it from step 2; after a reload or a direct visit the Community panel is asked. */
export async function loadSummaryHub (
  alreadyConnected: boolean,
  getFreeHub: () => Promise<HubStatus>,
): Promise<SummaryHub> {
  if (alreadyConnected) {
    return 'connected'
  }
  try {
    const data = await getFreeHub()
    return data.paired ? 'connected' : 'missing'
  } catch {
    // The source has no such call here; when the answer is lost the Connect block stays out rather than saying something untrue.
    return 'unknown'
  }
}

/** What the Summary knows about the AI (MCP) connection: `unknown` until `GET /mcp-tokens` answers (or when it fails). */
export type SummaryAi = 'unknown' | 'connected' | 'missing'

/** The tokens are always asked for: a token made in step 3 may be revoked on `/connect-ai` in the meantime. An active one
 * means connected. When the call fails, a token made in step 3 still counts (`alreadyConnected`); otherwise the row stays out (`unknown`). */
export async function loadSummaryAi (
  alreadyConnected: boolean,
  listTokens: () => Promise<McpToken[]>,
): Promise<SummaryAi> {
  try {
    return hasActiveToken(await listTokens()) ? 'connected' : 'missing'
  } catch {
    return alreadyConnected ? 'connected' : 'unknown'
  }
}

/** The edition row: only the Community panel is known (`community_panel`); any other panel shows no row. */
export function panelEdition (app: { community_panel?: boolean } | null | undefined): 'community' | null {
  return app?.community_panel === true ? 'community' : null
}

export const DOCUMENTATION_URL = 'https://www.panelalpha.com/documentation/single-server'

/** The guide of step 3, Connect AI (the page comes later, the link already points at it). */
export const CONNECT_AI_DOCUMENTATION_URL = `${DOCUMENTATION_URL}/connect-ai`
