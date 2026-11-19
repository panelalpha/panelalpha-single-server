<template>
  <wp-admin-sso-modal
    ref="modal"
    app-users
    icon="$externallink"
    :preview-provider-enabled="previewProviderEnabled"
    :single-server="singleServer"
    :title-key="titleKey"
    @close="emit('close')"
  />
</template>

<script lang="ts" setup>
  // A copy of the lite `WpAdminSsoModal` with the title `$externallink` + `button.adminArea`
  // and the endpoints `POST /instances/:id/users/:user/sso-url|sso-preview-url`. The state logic and the template
  // are shared with `WpAdminSsoModal`, which takes those differences as props. Users come from `GET /instances/:id/users`
  // (`getAppSsoUsers`, label `toAppSsoOptions`).
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { SsoUserOption } from '@/entities/project/wp-admin-sso'
  import { useTemplateRef } from 'vue'
  import WpAdminSsoModal from './WpAdminSsoModal.vue'

  withDefaults(defineProps<{
    singleServer?: boolean
    previewProviderEnabled?: boolean
    /** The title is "Admin Area" in the list's kebab and in the project frame's top bar. */
    titleKey?: string
  }>(), {
    titleKey: 'button.adminArea',
    singleServer: false,
    previewProviderEnabled: false,
  })

  const emit = defineEmits<{
    close: []
  }>()

  const modal = useTemplateRef<InstanceType<typeof WpAdminSsoModal>>('modal')

  function open (instance: InstanceResource, options: SsoUserOption[]): Promise<void> | undefined {
    return modal.value?.open(instance, options)
  }

  defineExpose({ open })
</script>
