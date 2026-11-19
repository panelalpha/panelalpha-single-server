<template>
  <div class="text-center">
    <div>
      <a
        class="register-terms-link"
        data-testid="auth-terms-link"
        href="#"
        role="button"
        @click.prevent="opened = true"
      >
        <slot>{{ t('heading.registerPage.termsOfService') }}</slot>
      </a>
    </div>

    <AppDialog
      v-model="opened"
      data-testid="terms-modal"
      overlay
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >
      <!-- No width class: the terms keep the 720px dialog. -->
      <basic-modal
        :buttons="buttons"
        icon="$configureRules"
        :title="t('heading.registerPage.termsOfService')"
        @button-click="opened = false"
        @modal-close="opened = false"
      >
        <template #custom>
          <div
            v-safe-html:rich="termsHtml"
            class="well well--gray pa-4"
          />
        </template>
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const { t } = useTranslation()
  const route = useRoute()
  const session = useSessionStore()
  const opened = ref(false)

  // Footer of the kit card: Close; the card adds an X that closes like it.
  const buttons = computed<ModalButton[]>(() => [{ id: 'close', label: t('button.close'), color: 'normal', type: 'cancel' }])

  /** HTML (`v-safe-html:rich`): admin-configured terms from `/api/home`. Legacy rendered them raw; next strips script, handlers and unsafe links. */
  const termsHtml = computed(() => {
    const app = session.home?.app
    if (!app) {
      return ''
    }

    if (Object.prototype.hasOwnProperty.call(route.query, 'control-panel-upgrade')) {
      return app.from_control_panel_registration?.tos ?? ''
    }

    return app.registration_tos ?? ''
  })
</script>

<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />

<style scoped>
/* V2 vendor: `.v-application a` coloured the activator link with primary; it sits outside the bottom box. */
.register-terms-link {
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}
</style>
