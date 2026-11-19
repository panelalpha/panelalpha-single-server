import type { InstanceResource } from '@/entities/project/instance-resource'

/**
 * A container (DinD) project: `custom` with `is_container`. A classic project is `custom` too until the
 * WordPress probe refines it, so `type === 'custom'` alone
 * also matches a plain PHP site. Engine treats the two differently (DinD restore ignores
 * `delete_existing_files`, `Backup.php:188-191`), so container-only UI asks this predicate.
 */
export function isContainerProject (instance: Pick<InstanceResource, 'type' | 'isContainer'>): boolean {
  return instance.type === 'custom' && instance.isContainer
}
