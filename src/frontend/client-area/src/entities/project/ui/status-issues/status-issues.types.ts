import type { HydratedIssue } from './issue-registry'

/** Payload of IssueResolveModal / StatusIndicator `resolve`; the lite screen runs the API calls. */
export interface IssueResolvePayload {
  issue: HydratedIssue
  solutionId: string
  value: unknown
}
