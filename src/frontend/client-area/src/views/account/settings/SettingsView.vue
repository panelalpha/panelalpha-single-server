<template>
  <page-frame
    v-model:tab="activeTab"
    :tabs="pageTabs"
    testid-prefix="settings"
    :title="t('settings.title')"
  >
    <v-container class="pa-0">
      <v-window v-model="activeTab">
        <v-window-item :value="0">
          <!-- Its own card, as wide as the settings card: its own GET /community/hub, independent of the settings load and error (`Settings.vue:27-32`). -->
          <hub-connection
            class="mb-6"
            data-testid="hub-card"
          />
        </v-window-item>

        <!-- ui-fix-v2: the tabs have no h4 of their own; the tab strip names the page. -->
        <v-window-item :value="1" />
      </v-window>

      <v-card
        class="settings-card"
        data-testid="settings-card"
        elevation="4"
      >
        <v-window v-model="activeTab">
          <v-window-item :value="0">
            <v-form
              ref="generalForm"
              @submit.prevent="saveGeneral"
            >
              <v-card-text class="pa-6 pb-0">
                <!-- Both sections are fed by GET /community/settings: they load, fail and retry together. -->
                <template v-if="loading">
                  <settings-section :title="t('settings.sections.general')">
                    <v-row
                      class="my-0"
                      data-testid="settings-skeleton"
                    >
                      <v-col
                        v-for="n in 3"
                        :key="n"
                        class="py-0 mb-6"
                        cols="12"
                        sm="6"
                      >
                        <v-skeleton-loader
                          class="settings-skeleton__label"
                          type="text"
                        />

                        <v-skeleton-loader
                          class="settings-skeleton__input"
                          type="image"
                        />

                        <div class="settings-skeleton__details" />
                      </v-col>
                    </v-row>
                  </settings-section>

                  <settings-section
                    :divider="false"
                    :title="t('settings.sections.url')"
                  >
                    <v-row class="my-0">
                      <v-col
                        class="py-0 mb-6"
                        cols="12"
                        sm="6"
                      >
                        <v-skeleton-loader
                          class="settings-skeleton__label"
                          type="text"
                        />

                        <v-skeleton-loader
                          class="settings-skeleton__input"
                          type="image"
                        />

                        <div
                          aria-hidden="true"
                          class="settings-skeleton__details"
                        >
                          {{ t('settings.urlTooltip') }}
                        </div>
                      </v-col>
                    </v-row>
                  </settings-section>
                </template>

                <settings-section
                  v-else-if="!settingsLoaded"
                  :title="t('settings.sections.general')"
                >
                  <error-card
                    class="settings-load-error mb-0"
                    data-testid="settings-error"
                    :message="settingsLoadErrors.join(' ')"
                  >
                    <template #action>
                      <AppButton
                        class="settings-retry"
                        data-testid="settings-retry"
                        kind="field"
                        type="button"
                        @click="loadSettings"
                      >
                        {{ t('button.retry') }}
                      </AppButton>
                    </template>
                  </error-card>
                </settings-section>

                <template v-else>
                  <settings-section :title="t('settings.sections.general')">
                    <v-row class="my-0">
                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field :label="t('settings.name')">
                          <v-text-field
                            v-model="form.name"
                            class="v-input--md"
                            data-testid="settings-field-name"
                            density="compact"
                            :disabled="savingGeneral"
                            :error-messages="generalFieldErrors.name"
                            name="name"
                            :rules="rules"
                            single-line
                            variant="outlined"
                            @update:model-value="clearGeneralError('name')"
                          />
                        </labeled-field>
                      </v-col>

                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field :label="t('settings.defaultLanguage')">
                          <settings-select
                            v-model="form.defaultLanguage"
                            class="settings-language"
                            data-testid="settings-field-language"
                            :disabled="savingGeneral"
                            :error-messages="generalFieldErrors.default_language"
                            :items="languages"
                            @update:model-value="clearGeneralError('default_language')"
                          />
                        </labeled-field>
                      </v-col>

                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field :label="t('settings.defaultDateFormat')">
                          <settings-select
                            v-model="form.defaultDateFormat"
                            class="settings-date-format"
                            data-testid="settings-field-date-format"
                            :disabled="savingGeneral"
                            :error-messages="generalFieldErrors.default_date_format"
                            :items="dateFormats"
                            @update:model-value="clearGeneralError('default_date_format')"
                          />
                        </labeled-field>
                      </v-col>
                    </v-row>
                  </settings-section>

                  <!-- Edited in place and saved with Save Changes (legacy: readonly, Change Domain opened a modal). -->
                  <settings-section :title="t('settings.sections.url')">
                    <v-row class="my-0">
                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field :label="t('settings.url')">
                          <v-text-field
                            v-model="urlInput"
                            class="v-input--md settings-url"
                            data-testid="settings-url"
                            density="compact"
                            :disabled="savingGeneral"
                            :error-messages="generalFieldErrors.url"
                            :hint="urlChanged ? t('settings.urlModal.dnsNote') : t('settings.urlTooltip')"
                            name="url"
                            persistent-hint
                            :rules="urlFieldRules"
                            single-line
                            variant="outlined"
                            @update:model-value="clearGeneralError('url')"
                          />
                        </labeled-field>
                      </v-col>
                    </v-row>

                    <!-- After a move: this address no longer answers, so the owner goes to the new one and signs in there. -->
                    <AppMessage
                      v-if="movedTo"
                      class="settings-url-moved mt-4"
                      data-testid="settings-url-moved"
                      :title="t('settings.urlMoved.title')"
                      variant="success"
                    >
                      {{ t('settings.urlMoved.text', { url: movedTo }) }}

                      <template #action>
                        <AppButton
                          data-testid="settings-url-moved-open"
                          :href="`${movedTo}/`"
                          kind="primary"
                        >
                          {{ t('settings.urlMoved.open') }}
                        </AppButton>
                      </template>
                    </AppMessage>

                    <!-- After a URL change with social login on: the callback URLs to update at each provider (legacy modal's OAuth step). -->
                    <div
                      v-if="oauthCallbacks.length > 0"
                      class="settings-oauth-callbacks pt-4"
                      data-testid="settings-oauth-callbacks"
                    >
                      <div class="font-weight-bold p-2 mb-1">
                        {{ t('settings.urlModal.oauthTitle') }}
                      </div>

                      <p class="p-2 mb-2">
                        {{ t('settings.urlModal.oauthNote') }}
                      </p>

                      <div
                        v-for="callback in oauthCallbacks"
                        :key="callback"
                        class="oauth-callback d-flex align-center mb-2"
                      >
                        <code class="flex-grow-1 text-truncate">{{ callback }}</code>

                        <AppButton
                          :aria-label="translate('button.copyUrl')"
                          class="oauth-copy"
                          kind="icon"
                          size="small"
                          @click="copy(callback)"
                        >
                          <v-icon
                            icon="$copy"
                            :size="18"
                          />
                        </AppButton>
                      </div>
                    </div>
                  </settings-section>

                  <!-- Not in legacy: GET /community/settings/sites-base-domain asks the Engine, so it loads and fails on its own;
                       saved with Save Changes like the fields above. -->
                  <settings-section
                    :divider="false"
                    :title="t('settings.sections.sitesBaseDomain')"
                  >
                    <v-row class="my-0">
                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field :label="t('settings.sitesBaseDomain')">
                          <!-- The Engine's own naming ladder (project_domain_bases), behind a help icon as FormHelpIcon: the name a new
                               project gets, then each fallback. -->
                          <template
                            v-if="sitesBaseDomain.info"
                            #label-append
                          >
                            <v-tooltip
                              location="bottom"
                              max-width="420"
                              open-delay="150"
                              transition="custom-tooltip"
                            >
                              <template #activator="{ props: activatorProps }">
                                <v-icon
                                  v-bind="activatorProps"
                                  :aria-label="t('settings.projectDomains.help')"
                                  class="text-gray-darken-1"
                                  data-testid="settings-project-domains-help"
                                  icon="$help"
                                  size="16"
                                />
                              </template>

                              <div
                                class="settings-project-domains"
                                data-testid="settings-project-domains"
                              >
                                <p
                                  v-if="projectDomains.length === 0"
                                  class="p-3 mb-0"
                                >
                                  {{ t('settings.projectDomains.engineChooses') }}
                                </p>

                                <div
                                  v-for="(line, index) in projectDomains"
                                  :key="index"
                                  class="settings-project-domain p-3"
                                  :class="index > 0 ? 'mt-3' : ''"
                                  data-testid="settings-project-domain"
                                >
                                  <div>{{ line.fallback ? t('settings.projectDomains.fallback') : t('settings.projectDomains.title') }}</div>

                                  <div
                                    class="settings-project-domain__name font-weight-bold"
                                    data-testid="settings-project-domain-name"
                                  >
                                    {{ line.example }}
                                  </div>

                                  <div>{{ line.note }}</div>
                                </div>
                              </div>
                            </v-tooltip>
                          </template>

                          <v-text-field
                            v-model="sitesBaseDomainInput"
                            class="v-input--md settings-sites-base-domain"
                            data-testid="settings-sites-base-domain"
                            density="compact"
                            :disabled="savingGeneral || !sitesBaseDomain.info"
                            :error-messages="sitesBaseDomain.errors.length > 0 ? sitesBaseDomain.errors : generalFieldErrors.sites_base_domain"
                            :hint="t('settings.sitesBaseDomainHint')"
                            :loading="sitesBaseDomain.loading"
                            name="sites_base_domain"
                            persistent-hint
                            persistent-placeholder
                            :placeholder="sitesBaseDomain.info ? t('settings.sitesBaseDomainNotSet') : ''"
                            :rules="sitesBaseDomainFieldRules"
                            single-line
                            variant="outlined"
                            @update:model-value="clearGeneralError('sites_base_domain')"
                          />
                        </labeled-field>

                        <AppButton
                          v-if="sitesBaseDomain.errors.length > 0"
                          class="settings-sites-base-domain-retry mb-4"
                          data-testid="settings-sites-base-domain-retry"
                          kind="link"
                          type="button"
                          @click="loadSitesBaseDomain"
                        >
                          {{ t('button.retry') }}
                        </AppButton>
                      </v-col>
                    </v-row>
                  </settings-section>
                </template>

                <!-- Server messages that belong to no field. -->
                <div
                  v-if="generalMessages.length > 0"
                  class="pb-6"
                >
                  <div
                    v-for="(message, index) in generalMessages"
                    :key="index"
                    class="settings-error text-error p-2 mb-1"
                    data-testid="settings-error"
                  >
                    {{ message }}
                  </div>
                </div>
              </v-card-text>

              <v-card-actions
                v-if="loading || settingsLoaded"
                class="d-flex justify-end"
              >
                <AppButton
                  data-testid="settings-save"
                  :disabled="loading || !changed"
                  kind="primary"
                  :loading="savingGeneral"
                  size="large"
                  type="submit"
                >
                  <!-- Vue 2 kept a space either side of the label and the content is `white-space: break-spaces` (+8px). -->
                  {{ ` ${t('button.saveChanges')} ` }}
                </AppButton>
              </v-card-actions>
            </v-form>
          </v-window-item>

          <v-window-item :value="1">
            <v-form
              ref="backupsForm"
              @submit.prevent="saveBackups"
            >
              <v-card-text class="pa-6 pb-0">
                <settings-section
                  :divider="backups.loading || backups.loaded"
                  :title="t('settings.sections.backupStorage')"
                >
                  <backup-storage
                    :default-local-location="backups.defaultLocalLocation"
                    :drivers="backups.drivers"
                    :errors="backups.errors"
                    :loaded="backups.loaded"
                    :loading="backups.loading"
                    :store="backups.store"
                    :store-created="backups.storeCreated"
                    :store-selected="backups.storeSelected"
                    @removed="onStoreRemoved"
                    @retry="loadBackups"
                    @saved="onStoreSaved"
                  />
                </settings-section>

                <settings-section
                  v-if="backups.loading || backups.loaded"
                  :divider="false"
                  :title="t('settings.sections.backupDefaults')"
                >
                  <!-- The fields of BackupSettings: two lines of two. -->
                  <template v-if="backups.loading">
                    <v-row
                      v-for="line in 2"
                      :key="line"
                      class="my-0"
                      :class="line > 1 ? 'mt-4' : ''"
                    >
                      <v-col
                        v-for="n in 2"
                        :key="n"
                        class="py-0 mb-6"
                        cols="12"
                        sm="6"
                      >
                        <v-skeleton-loader
                          class="settings-skeleton__label"
                          type="text"
                        />

                        <v-skeleton-loader
                          class="settings-skeleton__input"
                          type="image"
                        />
                      </v-col>
                    </v-row>
                  </template>

                  <backup-settings
                    v-else-if="backups.defaults"
                    ref="backupDefaultsSection"
                    :defaults="backups.defaults"
                    :disabled="savingBackups"
                    :errors="backupFieldErrors"
                    :store-configured="!!backups.store"
                    @changed="backupsChanged = $event"
                  />
                </settings-section>

                <!-- Server messages that belong to no field, or to a field that is not shown. -->
                <div
                  v-if="backupMessages.length > 0"
                  class="pb-6"
                >
                  <div
                    v-for="(message, index) in backupMessages"
                    :key="index"
                    class="settings-error text-error p-2 mb-1"
                  >
                    {{ message }}
                  </div>
                </div>
              </v-card-text>

              <v-card-actions
                v-if="backups.loading || backups.loaded"
                class="d-flex justify-end"
              >
                <AppButton
                  :disabled="!backups.loaded || !backupsChanged || !backups.store"
                  kind="primary"
                  :loading="savingBackups"
                  size="large"
                  type="submit"
                >
                  {{ ` ${t('button.saveChanges')} ` }}
                </AppButton>
              </v-card-actions>
            </v-form>
          </v-window-item>
        </v-window>
      </v-card>
    </v-container>

  </page-frame>
</template>

<script lang="ts" setup>
  import type { BackupDefaultsPayload } from './backups/backup-defaults'
  import type { PageFrameTab } from '@/shared/ui/page-frame/page-frame'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import HubConnection from '@/views/account/settings/hub/HubConnection.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { clearAllCachedGet } from '@/shared/api/cached-get'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { splitSaveError } from '@/shared/api/save-error'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import SettingsSelect from '@/shared/ui/form/SettingsSelect.vue'
  import { applyLanguage } from '@/shared/ui/language/apply-language'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import SettingsSection from '@/shared/ui/settings-section/SettingsSection.vue'
  import { BACKUP_FIELDS } from './backups/backup-defaults'
  import { DEFAULT_DRIVERS, DEFAULT_LOCAL_LOCATION } from './backups/backup-drivers'
  import BackupSettings from './backups/BackupSettings.vue'
  import BackupStorage from './backups/BackupStorage.vue'
  import { type FreeBackups, type FreeBackupStore, getFreeBackups, updateFreeBackups } from './backups/free-backups.api'
  import { type FreeSettings, getFreeSettings, updateFreeSettings, updateFreeUrl } from './free-settings.api'
  import { projectDomainLines } from './project-domains'
  import { loadErrorMessages, saved } from './settings-errors'
  import {
    dateFormatItems,
    GENERAL_FIELDS,
    generalChanged,
    type GeneralForm,
    languageItems,
    nameRules,
    type Translate,
  } from './settings-general'
  import { tabIndex, tabQuery } from './settings-tabs'
  import { type FreeSitesBaseDomain, getFreeSitesBaseDomain, updateFreeSitesBaseDomain } from './sites-base-domain.api'
  import { callbackUrls, sitesBaseDomainRules, urlRules } from './url-change'

  const { t: translate } = useTranslation()
  const t = translate as Translate
  const route = useRoute()
  const router = useRouter()

  const activeTab = ref(tabIndex(route.query.tab))
  const pageTabs = computed<PageFrameTab[]>(() => [
    { value: 0, title: t('settings.tabs.general') },
    { value: 1, title: t('settings.tabs.backups') },
  ])
  const loading = ref(true)
  // `GET /community/settings` (General and Application URL): the form exists only once it has succeeded.
  const settingsLoaded = ref(false)
  const settingsLoadErrors = ref<string[]>([])
  const settings = ref<FreeSettings | null>(null)
  // The Application URL: the loaded (or last saved) one, and the field. A change is saved with the others (no /home refresh, no
  // redirect, as the legacy modal). Saving a new address moves the panel there: `movedTo` is set once the old one no longer
  // answers.
  const url = ref('')
  const urlInput = ref('')
  const urlChanged = computed(() => urlInput.value.trim() !== url.value)
  const urlFieldRules = computed(() => urlRules(t))
  const movedTo = ref<string | null>(null)
  // After a URL change with social login providers on: their callback URLs (the legacy modal's OAuth step).
  const oauthCallbacks = ref<string[]>([])

  // `GET /community/settings/sites-base-domain`: the Engine's base domain for new projects and the names they get.
  const sitesBaseDomain = reactive<{ loading: boolean, errors: string[], info: FreeSitesBaseDomain | null }>({
    loading: true,
    errors: [],
    info: null,
  })
  const projectDomains = computed(() => sitesBaseDomain.info ? projectDomainLines(sitesBaseDomain.info, t) : [])
  const sitesBaseDomainInput = ref('')
  // The Engine stores it lower-cased; an empty field clears it.
  const sitesBaseDomainChanged = computed(() => !!sitesBaseDomain.info
    && sitesBaseDomainInput.value.trim().toLowerCase() !== (sitesBaseDomain.info.sites_base_domain ?? ''))
  const sitesBaseDomainFieldRules = computed(() => sitesBaseDomainRules(t))

  // `GET /community/backups`; it calls the Engine, so it may fail while General loads.
  const backups = reactive<{
    loading: boolean
    loaded: boolean
    errors: string[]
    store: FreeBackupStore | null
    storeSelected: boolean
    storeCreated: boolean
    defaults: FreeBackups['defaults'] | null
    drivers: string[]
    defaultLocalLocation: string
  }>({
    loading: true,
    loaded: false,
    errors: [],
    store: null,
    storeSelected: false,
    storeCreated: false,
    defaults: null,
    drivers: [...DEFAULT_DRIVERS],
    defaultLocalLocation: DEFAULT_LOCAL_LOCATION,
  })

  // Whether the default schedule differs from the stored one (BackupSettings `changed`); the Save button binds to it.
  const backupsChanged = ref(false)

  const session = useSessionStore()
  const alerts = useAlertsStore()
  const generalForm = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('generalForm')

  const backupsForm = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('backupsForm')
  const backupDefaultsSection = useTemplateRef<{ payload: () => BackupDefaultsPayload, hasField: (key: string) => boolean }>('backupDefaultsSection')
  const savingBackups = ref(false)
  // The 422 of a Backups Save: messages by request key for the shown fields, and the ones without a field.
  const backupFieldErrors = ref<Record<string, string[]>>({})
  const backupMessages = ref<string[]>([])

  const savingGeneral = ref(false)
  // The 422 of a Save: messages by request key for the fields, and the ones without a field.
  const generalFieldErrors = ref<Record<string, string[]>>({})
  const generalMessages = ref<string[]>([])
  const form = ref<GeneralForm>({ name: '', defaultLanguage: '', defaultDateFormat: '' })
  // The General values of the last load or save: Save is active only while the form differs.
  const savedForm = ref<GeneralForm>({ ...form.value })

  const changed = computed(() => generalChanged(form.value, savedForm.value) || urlChanged.value || sitesBaseDomainChanged.value)
  const rules = computed(() => nameRules(t))
  const languages = computed(() => languageItems(settings.value?.languages ?? [], t))
  const dateFormats = computed(() => dateFormatItems(settings.value?.date_formats ?? []))

  // The navbar's `/settings` link reuses this view, so the query can change while it is mounted.
  watch(() => route.query.tab, tab => {
    activeTab.value = tabIndex(tab)
  })

  // Puts the open tab into the URL, keeping the rest of the query (the Hub connection consumes `state` / `result` itself).
  watch(activeTab, index => {
    const query = tabQuery(index, route.query)
    if (query) {
      // vue-router rejects a navigation to where it already is.
      Promise.resolve(router.replace({ query })).catch(() => {})
    }
  })

  // Also the Retry of the General load error: back to the skeleton until the request settles.
  async function loadSettings () {
    loading.value = true
    settingsLoadErrors.value = []
    try {
      const data = await getFreeSettings()
      settings.value = data
      url.value = data.url || ''
      urlInput.value = url.value
      form.value = {
        name: data.name,
        defaultLanguage: data.default_language,
        defaultDateFormat: data.default_date_format,
      }
      savedForm.value = { ...form.value }
      settingsLoaded.value = true
    } catch (error) {
      settingsLoadErrors.value = loadErrorMessages(error)
    } finally {
      loading.value = false
    }
  }

  // Also the Retry of the Backups load error.
  async function loadBackups () {
    backups.loading = true
    backups.errors = []
    try {
      applyBackups(await getFreeBackups())
      backups.loaded = true
    } catch (error) {
      backups.errors = loadErrorMessages(error)
    } finally {
      backups.loading = false
    }
  }

  async function loadSitesBaseDomain () {
    sitesBaseDomain.loading = true
    sitesBaseDomain.errors = []
    try {
      sitesBaseDomain.info = await getFreeSitesBaseDomain()
      sitesBaseDomainInput.value = sitesBaseDomain.info.sites_base_domain ?? ''
    } catch (error) {
      sitesBaseDomain.errors = loadErrorMessages(error)
    } finally {
      sitesBaseDomain.loading = false
    }
  }

  function applyBackups (data: FreeBackups) {
    backups.store = data.store
    backups.storeSelected = data.store_selected === true
    backups.storeCreated = data.store_created === true
    backups.defaults = data.defaults
    backups.drivers = data.drivers || backups.drivers
    backups.defaultLocalLocation = data.default_local_location || backups.defaultLocalLocation
  }

  // Only the store changes; unsaved edits of the backup settings stay in the form.
  function onStoreSaved (data: Pick<FreeBackups, 'store' | 'store_selected' | 'store_created'>) {
    applyStore(data)
  }

  // Removing the store forgets the choice too, so the Remove button goes away and the Engine's own store is shown.
  function onStoreRemoved (data: FreeBackups) {
    applyStore(data)
  }

  function applyStore (data: Pick<FreeBackups, 'store' | 'store_selected' | 'store_created'>) {
    backups.store = data.store
    backups.storeSelected = data.store_selected === true
    backups.storeCreated = data.store_created === true
  }

  // The Backups tab only: the default schedule for new projects. The store has its own modal.
  async function saveBackups () {
    const section = backupDefaultsSection.value
    if (savingBackups.value || !section || !backupsChanged.value) {
      return
    }
    if (backupsForm.value && !(await backupsForm.value.validate()).valid) {
      return
    }
    // Taken before the request, so it is the values just validated.
    const payload = section.payload()
    backupFieldErrors.value = {}
    backupMessages.value = []
    savingBackups.value = true
    try {
      const data = await updateFreeBackups(payload)
      // Only the defaults: the store is the modal's (onStoreSaved), and one saved meanwhile stays.
      if (data?.defaults) {
        backups.defaults = data.defaults
      }
      saved(t)
    } catch (error) {
      // day_of_week / day_of_month are sent for every frequency, but only the chosen one has a field.
      const failure = splitSaveError(error, BACKUP_FIELDS, key => section.hasField(key))
      if (failure) {
        backupFieldErrors.value = failure.fields
        backupMessages.value = failure.messages
      } else {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
        // The defaults may be stored even so: show what the server holds.
        loadBackups()
      }
    } finally {
      savingBackups.value = false
    }
  }

  function clearGeneralError (key: string) {
    if (generalFieldErrors.value[key]) {
      const { [key]: _removed, ...rest } = generalFieldErrors.value
      generalFieldErrors.value = rest
    }
  }

  const providers = computed(() => {
    const auth = session.home?.app?.integrations?.auth
    return Array.isArray(auth) ? auth : []
  })

  // No toast.
  function copy (text: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {})
    }
  }

  // A 422 goes under its field, or among the tab's messages; anything else is a toast.
  function showSaveError (error: unknown, fields: string[]) {
    const failure = splitSaveError(error, fields)
    if (failure) {
      generalFieldErrors.value = { ...generalFieldErrors.value, ...failure.fields }
      generalMessages.value = [...generalMessages.value, ...failure.messages]
    } else {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  // The General tab: each part that changed goes to its own route (the settings, the URL, the Engine's base domain); a part
  // that fails shows its error and the others stay saved. After the settings PUT: toast, then /home is refreshed before the language
  // changes (it would reapply the old default).
  async function saveGeneral () {
    if (savingGeneral.value || !settingsLoaded.value) {
      return
    }
    if (generalForm.value && !(await generalForm.value.validate()).valid) {
      return
    }
    // Taken before the requests, so they are the values just validated.
    const values = { ...form.value }
    const settingsDirty = generalChanged(values, savedForm.value)
    const newUrl = urlChanged.value ? urlInput.value.trim() : null
    const newBase = sitesBaseDomainChanged.value ? sitesBaseDomainInput.value.trim() : null
    generalFieldErrors.value = {}
    generalMessages.value = []
    oauthCallbacks.value = []
    movedTo.value = null
    savingGeneral.value = true
    let failed = false
    let settingsSaved = false

    if (settingsDirty) {
      try {
        await updateFreeSettings({
          name: values.name,
          default_language: values.defaultLanguage,
          default_date_format: values.defaultDateFormat,
        })
        savedForm.value = values
        settingsSaved = true
      } catch (error) {
        failed = true
        showSaveError(error, GENERAL_FIELDS)
      }
    }
    if (newUrl !== null) {
      try {
        const answer = await updateFreeUrl(newUrl)
        url.value = answer.url
        urlInput.value = answer.url
        movedTo.value = answer.moved ? answer.url : null
        oauthCallbacks.value = callbackUrls(answer.url, providers.value)
      } catch (error) {
        failed = true
        showSaveError(error, ['url'])
      }
    }
    if (newBase !== null) {
      try {
        sitesBaseDomain.info = await updateFreeSitesBaseDomain(newBase)
        sitesBaseDomainInput.value = sitesBaseDomain.info.sites_base_domain ?? ''
      } catch (error) {
        failed = true
        showSaveError(error, ['sites_base_domain'])
      }
    }

    if (!failed) {
      saved(t)
    }
    if (settingsSaved) {
      try {
        clearAllCachedGet()
        const home = await session.ensureHome(true)
        await applyLanguage(home.user?.language ?? home.app?.default_language ?? 'en')
        emitAppEvent('document-title-update')
      } catch (error) {
        // The values are saved; only the refresh failed, and they apply on the next page load.
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    }
    savingGeneral.value = false
  }

  onMounted(() => {
    loadSettings()
    loadBackups()
    loadSitesBaseDomain()
  })
</script>

<style lang="scss" scoped>
// In legacy every `.row` is `margin: -16px` and every `.col-12` / `.col-6` / `.col-3` pads 16px (not
// ported globally). V4 spaces a row with `gap` instead (24px, which added a row gap between the fields and 5px to each column),
// so the gap is dropped and the legacy numbers come back; the `my-0` / `py-0` / `pa-4` utilities are `!important` and still win.
.settings-card :deep(.v-row) {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: -16px;
}

.settings-card :deep(.v-col) {
  padding: 16px;
}

// Legacy fields are `outlined dense`: the V2 slot keeps a 4px bottom margin and the 14px details row nets -2px (`-4px` / `-12px`
// margins), so an idle field is 2px taller than its slot and one with a message sits 4px (not 8px) above it. V4 details are a
// sibling of the control: the field gets the 4px, the control gives 2px back; with a message the details row is the V4 one.
.settings-card :deep(.v-input .v-field) {
  margin-bottom: 4px;
}

.settings-card :deep(.v-input:not(:has(.v-messages__message)) .v-input__control) {
  margin-bottom: -2px;
}

.oauth-callback code {
  padding: 4px 8px;
}

// As the legacy modal's copy button: 32px square, so each callback row stays 32px.
.oauth-callback .oauth-copy.v-btn {
  width: 32px;
  height: 32px;
}

.v-card-actions {
  border-top: 1px solid var(--v-gray-lighten5);
}

// Skeletons the size of a label and of a field (md input, large button), so nothing moves when data arrives.
.settings-skeleton {
  // V2 skeleton roots were transparent (V4 paints the surface colour behind the bones).
  &__label,
  &__input,
  &__button {
    background: transparent;
  }

  &__label :deep(.v-skeleton-loader__text) {
    height: 12px;
    margin: 4px 0;
    max-width: 40%;
  }

  // Dimensions of the legacy skeleton: field 40, large button 48, gap 12.
  &__input {
    margin-top: 12px;
  }

  &__input :deep(.v-skeleton-loader__image) {
    height: 40px;
  }

  // The messages line Vuetify keeps under a field without hide-details; a hint inside it is
  // invisible and only wraps like the real one.
  &__details {
    min-height: 14px;
    margin-bottom: 8px;
    padding: 0 12px;
    line-height: 20px;
    letter-spacing: normal;
    visibility: hidden;
  }

  &__button :deep(.v-skeleton-loader__image) {
    height: 48px;
  }
}
</style>
