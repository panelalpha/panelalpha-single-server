<template>
  <div
    class="no-data no-data--instances"
    data-testid="instances-no-data"
    :style="{ 'background-image': 'url(' + backgroundImage + ')' }"
  >
    <v-container>
      <div class="nodata-container w-100 d-flex align-center justify-center">
        <v-card
          class="px-12 py-12"
          data-testid="instances-no-data-card"
          elevation="4"
        >
          <EmptyState
            :desc="t('message.emptyTable.projects.subtitle', { defaultValue: 'No projects yet. Create one to get started.' })"
            :title="t('message.emptyTable.instances.title')"
            title-tag="h1"
            title-testid="instances-no-data-title"
            variant="welcome"
          >
            <template #image>
              <wordpress-illustration />
            </template>

            <template #above-title>
              <p class="mb-0 text-primary-darken-1 p-2 font-weight-bold mt-5">
                {{ t('general.greeting', { name }) }}
              </p>
            </template>

            <template #action>
              <AppButton
                data-testid="instances-no-data-create"
                kind="primary"
                :loading="loadingServices"
                size="x-large"
                @click="loadServices"
              >
                <v-icon
                  color="white"
                  icon="$plus"
                />

                <span class="font-weight-600">{{ t('button.instance.create') }}</span>
              </AppButton>
            </template>
          </EmptyState>
        </v-card>
      </div>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // Create emits `start-installation-process` after the services are loaded; the onboarding handles it.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useTheme } from 'vuetify'
  import backgroundDark from '@/views/projects/assets/instances-background-dark.png'
  import background from '@/views/projects/assets/instances-background.png'
  import { emit } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import WordpressIllustration from './illustrations/WordpressIllustration.vue'

  const { t } = useTranslation()
  const session = useSessionStore()
  const theme = useTheme()

  const loadingServices = ref(false)

  function getThemeFromLocalStorage (): boolean {
    try {
      return localStorage.getItem('isDarkMode') === 'true'
    } catch {
      return false
    }
  }

  // Legacy reads only `localStorage.isDarkMode` (written by the user menu) and follows `$vuetify.theme.dark` afterwards.
  // NEXT also starts from the live theme: nothing in the shell writes `isDarkMode` on the first dark /home yet.
  const themeDark = computed(() => theme.global.current.value.dark)
  const isDarkMode = ref(getThemeFromLocalStorage() || themeDark.value)

  watch(themeDark, value => {
    isDarkMode.value = value
  })

  onMounted(() => {
    isDarkMode.value = getThemeFromLocalStorage() || themeDark.value
  })

  const name = computed(() => session.user?.name || t('general.adventurer'))
  const backgroundImage = computed(() => (isDarkMode.value ? backgroundDark : background))

  async function loadServices (): Promise<void> {
    loadingServices.value = true
    try {
      await session.refreshServices()
    } catch {
      // A failed `/home` only releases the button, as in AddNewInstanceButton and HostingInstancesCard.
      return
    } finally {
      loadingServices.value = false
    }
    emit('start-installation-process')
  }
</script>

<style lang="scss" scoped>
.no-data {
  background-position: center -133px;
  margin-left: -24px;
  margin-right: -24px;
}

.v-container {
  height: calc(100vh - 88px);
  padding: 0;
  margin-top: auto;
  padding-left: 24px;
  padding-right: 24px;
  margin-bottom: -60px;
}

.nodata-container {
  height: 100%;

  .v-card {
    margin-top: auto;
    margin-bottom: auto;
    border-radius: 12px;
  }

}
</style>
