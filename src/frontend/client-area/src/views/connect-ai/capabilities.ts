/** Six categories (heading key suffix, icon alias) and the copy keys of their commands. */
export interface CapabilityCategory {
  key: string
  icon: string
  commands: string[]
}

function commandKeys (category: string, names: string[]): string[] {
  return names.map(name => `heading.connectAi.commands.${category}.${name}`)
}

export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  { key: 'daily', icon: '$grid', commands: commandKeys('daily', ['instances', 'down', 'restartN8n', 'stopStaging', 'maintenance']) },
  { key: 'backups', icon: '$backup', commands: commandKeys('backups', ['daily', 'last', 'restore', 'manual', 'deleteOld']) },
  { key: 'domains', icon: '$globe', commands: commandKeys('domains', ['add', 'ssl', 'list']) },
  { key: 'developer', icon: '$wrench', commands: commandKeys('developer', ['staging', 'push', 'logs', 'setEnv', 'showEnv']) },
  { key: 'monitoring', icon: '$barchart', commands: commandKeys('monitoring', ['502', 'usage', 'top', 'errors']) },
  { key: 'bulk', icon: '$list', commands: commandKeys('bulk', ['updateWp', 'noBackups', 'enableSsl', 'summary']) },
]

export function categoryLabelKey (category: CapabilityCategory): string {
  return `heading.connectAi.capabilities.${category.key}`
}
