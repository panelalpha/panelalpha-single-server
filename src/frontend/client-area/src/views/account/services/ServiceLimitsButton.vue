<template>
  <div class="service-limits">
    <AppButton
      data-testid="services-limits"
      kind="link"
      size="small"
      @click.prevent="open = true"
    >
      <span class="font-weight-bold">{{ label }}</span>
    </AppButton>

    <ProjectLimitsModal
      v-model="open"
      :instance="instance"
      :read-only="readOnly"
      :save="save"
      @saved="onSaved"
    />
  </div>
</template>

<script lang="ts" setup>
  // Manage limits of a plan row on My plans (paid editions): the same modal as Project details > Limits, for the plan's project. The
  // project comes fetched from the page (`useServiceProjects`); the page keeps the new `resources` of a save, so the Limits cell follows.
  import type { LimitsSaved } from './service-limits'
  import type { InstanceResource, RawProjectResources } from '@/entities/project/instance-resource'
  import type { ProjectLimitsBody } from '@/entities/project/project-limits.api'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { updateLimits } from '@/entities/project/project-limits.api'
  import ProjectLimitsModal from '@/entities/project/ui/ProjectLimitsModal.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'limits-updated': [id: number, resources: RawProjectResources]
    'limits-saved': [saved: LimitsSaved]
  }>()

  const { t: translate } = useTranslation()
  const t = translate as (key: string, options?: Record<string, unknown>) => string

  const open = ref(false)
  const readOnly = computed(() => !props.instance.hasManageLimitsPrivilege())
  // Without the privilege the modal only shows the limits, as the View all link of Project details.
  const label = computed(() => readOnly.value
    ? t('button.viewLimits', { defaultValue: 'View limits' })
    : t('button.manageLimits', { defaultValue: 'Manage limits' }))

  /** `PUT /instances/{id}/limits`: the answer is the new `resources` block of the project, which the page keeps. */
  async function save (body: ProjectLimitsBody): Promise<boolean> {
    const id = Number(props.instance.id)
    emit('limits-updated', id, await updateLimits(id, body))
    return true
  }

  function onSaved (needsRebuild: boolean): void {
    emit('limits-saved', { id: Number(props.instance.id), domain: props.instance.domain ?? '', needsRebuild })
  }
</script>
