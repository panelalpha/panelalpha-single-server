import { isFailedStatus, TERMINAL_STATUSES } from './deploy-log-ui'

// Fixed 3-step pipeline for every deploy. The engine appends stage entries only for the stages it runs,
// in this order. While the deploy runs, a missing entry before the furthest current or present stage is
// skipped (the engine went past it), a later one is pending. Once the deploy finished, every missing entry is skipped.
export const STAGE_ORDER = ['preparing', 'cloning', 'running']

/** The deploy's source, when the screen knows it: a files project has no repository to clone. */
export type DeploySource = 'git' | 'files'

export type DeployStepState = 'done' | 'error' | 'progress' | 'pending' | 'skipped'

/** The source a project's `source.type` names, when it is one the step copy knows. */
export function deploySourceOf (type: string | null | undefined): DeploySource | null {
  return type === 'files' || type === 'git' ? type : null
}

/**
 * The copy of a step. The engine names its stages after the git pipeline for every source, but a files project's
 * `cloning` stage unpacks the uploaded archive (the deploy dialog offers "We unpack it for you"), so that label says so.
 */
export function deployStepLabelKey (name: string, source: DeploySource | null | undefined): string {
  if (name === 'cloning' && source === 'files') {
    return 'deployLogs.step.files'
  }
  return `deployLogs.step.${name}`
}

export interface DeployStage {
  name: string
  // Unix seconds, as the engine reports them.
  started_at?: number | null
  finished_at?: number | null
}

export interface DeployStep {
  name: string
  state: DeployStepState
  duration: number | null
}

export function visibleSteps (
  stages: DeployStage[] | null | undefined,
  currentStage: string | null | undefined,
  status: string,
): DeployStep[] {
  const present = Array.isArray(stages) ? stages : []
  const isTerminal = TERMINAL_STATUSES.includes(status)
  const isFailed = isFailedStatus(status)
  // The furthest stage the deploy reached: the current one or any present one. -1 when none is known.
  const furthest = Math.max(
    STAGE_ORDER.indexOf(currentStage ?? ''),
    ...present.map(s => STAGE_ORDER.indexOf(s.name)),
  )

  return STAGE_ORDER.map((name): DeployStep => {
    const stage = present.find(s => s.name === name) ?? null
    let state: DeployStepState
    if (isFailed && name === currentStage) {
      // The stage a deploy died in carries the deploy's end as its finish stamp.
      state = 'error'
    } else if (stage && stage.finished_at) {
      state = 'done'
    } else if (isTerminal && stage) {
      state = isFailed ? 'error' : 'done'
    } else if (stage || name === currentStage) {
      state = isTerminal ? (isFailed ? 'error' : 'done') : 'progress'
    } else {
      if (isTerminal) {
        state = 'skipped'
      } else {
        state = STAGE_ORDER.indexOf(name) < furthest ? 'skipped' : 'pending'
      }
    }

    return {
      name,
      state,
      duration:
        stage && stage.started_at && stage.finished_at
          ? Math.max(1, stage.finished_at - stage.started_at)
          : null,
    }
  })
}
