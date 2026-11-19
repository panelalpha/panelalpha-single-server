// Named apart from `deploy-steps.ts` (the log stages): this one is the deploy command categories.

import type { DeployStepKey, ProjectSourceDeployStep } from '@/entities/project/project-source.api'

export const DEPLOY_STEP_KEYS: readonly DeployStepKey[] = ['dependencies', 'build', 'migrations'] as const

export type DeploySteps = Partial<Record<DeployStepKey, ProjectSourceDeployStep>> | null | undefined

export interface VisibleDeployStep {
  key: DeployStepKey
  commands: string[]
  skippable: boolean
}

// Only the categories with at least one command, in the fixed order.
export function visibleDeploySteps (steps: DeploySteps): VisibleDeployStep[] {
  const source = steps ?? {}
  return DEPLOY_STEP_KEYS.flatMap((key): VisibleDeployStep[] => {
    const step = source[key]
    const commands = Array.isArray(step?.commands) ? step.commands : []
    if (commands.length === 0) {
      return []
    }
    return [{ key, commands, skippable: step?.skippable === true }]
  })
}

// Model holds the UNCHECKED categories (skipped). Checked = the step runs.
export function toggleSkipped (
  skipped: readonly DeployStepKey[],
  key: DeployStepKey,
  checked: boolean,
): DeployStepKey[] {
  const rest = skipped.filter(item => item !== key)
  return checked ? rest : [...rest, key]
}

// Only the unchecked categories the target still lets the user skip. An empty result means no `skip` key.
export function skipPayload (
  steps: DeploySteps,
  skipped: readonly DeployStepKey[],
): { skip?: DeployStepKey[] } {
  const skip = visibleDeploySteps(steps)
    .filter(step => step.skippable && skipped.includes(step.key))
    .map(step => step.key)
  return skip.length > 0 ? { skip } : {}
}
