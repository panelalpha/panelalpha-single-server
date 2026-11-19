// Keys stay i18n keys, not text.

export const CATEGORY_ORDER = ['deploy', 'wordpress', 'woocommerce', 'backup'] as const

export type IssueCategory = (typeof CATEGORY_ORDER)[number]

export interface BackupDetailLike {
  id?: number | string
  async_status?: {
    create?: string | null
    restore?: string | null
  } | null
}

/** The project keys of the Engine's `details` map that carry the last deploy's outcome (the panel syncs them). */
export interface ProjectDetailsLike {
  /** `success|partial|failed` (`Jobs/DeployProject.php`). `partial` is a deploy that finished with warnings. */
  deployment_status?: string | null
  /** The warnings of a partial deploy: findings (`{code, message}`), or sentences from an older Engine. */
  deployment_warnings?: (string | { code?: string | null, message?: string | null })[] | null
}

/**
 * The fields and duck-typed methods the legacy issue code reads from an instance model. The methods are
 * optional because legacy checked `typeof inst.method === "function"` before every call.
 */
export interface InstanceLike {
  id?: number | string
  type?: string | null
  /** The Engine's project `details` map, as far as the deploy warning reads it (`ProjectDetailsLike`). */
  details?: unknown
  status?: {
    [key: string]: unknown
    wordpress?: string | null
    wordpress_available?: string | null
    woocommerce?: string | null
    woocommerce_available?: string | null
  } | null
  backup_details?: BackupDetailLike[] | null
  hasWordPressUpdatePrivilege?: () => boolean
  hasRedeployPrivilege?: () => boolean
  hasAutomaticBackup?: () => boolean
  hasRecentBackup?: () => boolean
  shouldHaveRecentBackup?: () => boolean
  hasUpdateInProgress?: () => boolean
}

export interface IssueParams {
  [key: string]: unknown
  current?: string | null
  available?: string | null
  port?: number
  autoOff?: boolean
  noRecent?: boolean
}

export interface CollectedIssue {
  code: string
  category: IssueCategory
  params?: IssueParams
  titleKey?: string
  descriptionKey?: string
  /** The Engine's own words (app-health check title/detail); shown before the copy from the key. */
  title?: string | null
  detail?: string | null
}

export type SolutionUi = 'upload-archive'

export interface IssueSolution {
  id: string
  ui: SolutionUi
  titleKey: string
  descriptionKey: string
}

export type IssueAction
  = | { type: 'navigate', to: (instance: InstanceLike) => string, show: (instance: InstanceLike) => boolean }
    | { type: 'openModal' }

interface IssueDefinition {
  category: IssueCategory
  severity: string
  titleKey?: string
  descriptionKey?: string
  labelKey?: string
  modalTitleKey?: string
  modalDescriptionKey?: string
  /** Absent for issues that only inform (Engine warnings from `/source`): no button. */
  action?: IssueAction
  solutions?: IssueSolution[]
}

export interface HydratedIssue extends CollectedIssue {
  severity?: string
  titleKey: string
  descriptionKey: string
  labelKey: string
  modalTitleKey?: string
  modalDescriptionKey?: string
  action: IssueAction | null
  solutions: IssueSolution[]
  showAction: boolean
}

function canUpdateWordPress (inst: InstanceLike): boolean {
  return typeof inst.hasWordPressUpdatePrivilege === 'function' ? inst.hasWordPressUpdatePrivilege() : true
}

export const ISSUE_REGISTRY: Record<string, IssueDefinition> = {
  'wordpress.core_outdated': {
    category: 'wordpress',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.wordpress.outdated.title',
    descriptionKey: 'heading.instance.statusIndicator.wordpress.outdated.description',
    labelKey: 'button.update',
    action: {
      type: 'navigate',
      to: inst => `${inst.id}/general`,
      show: canUpdateWordPress,
    },
  },
  'woocommerce.outdated': {
    category: 'woocommerce',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.woocommerce.outdated.title',
    descriptionKey: 'heading.instance.statusIndicator.woocommerce.outdated.description',
    labelKey: 'button.update',
    action: {
      type: 'navigate',
      to: inst => `${inst.id}/plugins`,
      show: canUpdateWordPress,
    },
  },
  'backup.attention': {
    category: 'backup',
    severity: 'error',
    action: {
      type: 'navigate',
      to: inst => `${inst.id}/backups`,
      show: () => true,
    },
  },
  'deploy.missing_index': {
    category: 'deploy',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.deploy.missingIndex.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.missingIndex.description',
    modalTitleKey: 'heading.instance.statusIndicator.deploy.missingIndex.modalTitle',
    modalDescriptionKey: 'heading.instance.statusIndicator.deploy.missingIndex.modalDescription',
    labelKey: 'button.statusIndicator.resolve',
    action: { type: 'openModal' },
    solutions: [
      {
        id: 'upload',
        ui: 'upload-archive',
        titleKey: 'heading.instance.statusIndicator.deploy.missingIndex.upload.title',
        descriptionKey: 'heading.instance.statusIndicator.deploy.missingIndex.upload.description',
      },
    ],
  },
  'deploy.port_mismatch': {
    category: 'deploy',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.deploy.portMismatch.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.portMismatch.description',
    modalTitleKey: 'heading.instance.statusIndicator.deploy.portMismatch.modalTitle',
    modalDescriptionKey: 'heading.instance.statusIndicator.deploy.portMismatch.modalDescription',
    labelKey: 'button.statusIndicator.resolve',
    action: { type: 'openModal' },
    solutions: [
      {
        id: 'upload',
        ui: 'upload-archive',
        titleKey: 'heading.instance.statusIndicator.deploy.portMismatch.upload.title',
        descriptionKey: 'heading.instance.statusIndicator.deploy.portMismatch.upload.description',
      },
    ],
  },
  // Engine warnings of the project source (`/source`): informational, no action.
  'deploy.not_deployable': {
    category: 'deploy',
    severity: 'error',
    titleKey: 'heading.instance.statusIndicator.deploy.notDeployable.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.notDeployable.description',
  },
  'deploy.last_deploy_warnings': {
    category: 'deploy',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.deploy.lastDeployWarnings.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.lastDeployWarnings.description',
  },
  'deploy.drift.strategy': {
    category: 'deploy',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.deploy.drift.strategy.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.drift.strategy.description',
  },
  'deploy.drift.runtime': {
    category: 'deploy',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.deploy.drift.runtime.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.drift.runtime.description',
  },
  'deploy.drift.port': {
    category: 'deploy',
    severity: 'warning',
    titleKey: 'heading.instance.statusIndicator.deploy.drift.port.title',
    descriptionKey: 'heading.instance.statusIndicator.deploy.drift.port.description',
  },
}

function backupCopy (params: IssueParams): { titleKey: string, descriptionKey: string, labelKey: string } {
  if (params.autoOff && params.noRecent) {
    return {
      titleKey: 'heading.instance.statusIndicator.backup.noRecent.title',
      descriptionKey: 'heading.instance.statusIndicator.backup.autoOff.description',
      labelKey: 'button.statusIndicator.enableBackups',
    }
  }
  if (params.autoOff) {
    return {
      titleKey: 'heading.instance.statusIndicator.backup.autoOff.title',
      descriptionKey: 'heading.instance.statusIndicator.backup.autoOff.hint',
      labelKey: 'button.statusIndicator.enableBackups',
    }
  }
  return {
    titleKey: 'heading.instance.statusIndicator.backup.noRecent.title',
    descriptionKey: 'heading.instance.statusIndicator.backup.noRecent.hint',
    labelKey: 'button.statusIndicator.viewBackups',
  }
}

export function hydrateIssue (collected: CollectedIssue, instance: InstanceLike): HydratedIssue {
  const def = ISSUE_REGISTRY[collected.code]
  if (!def) {
    return {
      ...collected,
      titleKey: collected.titleKey || collected.code,
      descriptionKey: collected.descriptionKey || '',
      labelKey: '',
      action: null,
      solutions: [],
      showAction: false,
    }
  }

  const copy = collected.code === 'backup.attention' ? backupCopy(collected.params || {}) : undefined

  let solutions = def.solutions ? def.solutions.slice() : []
  if (
    solutions.length > 0
    && typeof instance.hasRedeployPrivilege === 'function'
    && !instance.hasRedeployPrivilege()
  ) {
    solutions = solutions.filter(s => s.ui !== 'upload-archive')
  }

  const { action } = def
  let showAction = false
  if (action) {
    showAction = action.type === 'openModal' ? solutions.length > 0 : action.show(instance)
  }

  return {
    ...collected,
    category: def.category,
    severity: def.severity,
    titleKey: copy?.titleKey || def.titleKey || '',
    descriptionKey: copy?.descriptionKey || def.descriptionKey || '',
    labelKey: copy?.labelKey || def.labelKey || '',
    modalTitleKey: def.modalTitleKey,
    modalDescriptionKey: def.modalDescriptionKey,
    action: action ?? null,
    solutions,
    showAction,
  }
}
