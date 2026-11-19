<template>
  <div>
    <AdvancedPageLayout :title="t('heading.instance.advanced.git.title')">
      <v-col
        class="pb-2"
        cols="12"
      >
        <AppMessage
          v-if="hostingUnsupported"
          class="mb-4 git-unsupported-alert"
          role="alert"
          variant="warning"
        >
          <p>{{ t('heading.instance.advanced.git.hostingUnsupported') }}</p>
        </AppMessage>

        <GitCardSkeleton
          v-if="loading"
          :connected="instance.git_repository?.connected === true"
        />

        <template v-else>
          <!-- Drift banner: Push or Pull first, Revert and Ignore (the buttons need `manage_git`). -->
          <AppMessage
            v-if="showDrift"
            class="mb-4 git-drift-banner"
            variant="warning"
          >
            <p>{{ t('heading.instance.advanced.git.drift.banner') }}</p>

            <p
              v-if="driftHint"
              class="mt-2"
            >
              {{ driftHint }}
            </p>

            <template
              v-if="canManageGit"
              #action
            >
              <AppButton
                v-if="!remoteAhead"
                :disabled="syncActionsDisabled"
                kind="primary"
                :loading="submitting.push"
                size="small"
                @click="pushFromCard"
              >
                {{ ` ${t('heading.instance.advanced.git.drift.push')} ` }}
              </AppButton>

              <AppButton
                v-else
                :disabled="syncActionsDisabled"
                kind="primary"
                :loading="submitting.pull"
                size="small"
                @click="pullFromCard"
              >
                {{ ` ${t('heading.instance.advanced.git.drift.pullFirst')} ` }}
              </AppButton>

              <AppButton
                :disabled="syncActionsDisabled"
                kind="danger"
                :loading="submitting.revert"
                size="small"
                @click="revertFromDrift"
              >
                {{ ` ${t('heading.instance.advanced.git.drift.revert')} ` }}
              </AppButton>

              <AppButton
                class="git-text-btn git-btn-32"
                :disabled="actionsDisabled"
                kind="text"
                :loading="submitting.ignoreDrift"
                size="small"
                @click="ignoreDrift"
              >
                {{ ` ${t('heading.instance.advanced.git.drift.ignore')} ` }}
              </AppButton>
            </template>
          </AppMessage>

          <!-- Local repository banner: the folder is missing on the server, Repair (with `manage_git`). -->
          <AppMessage
            v-if="showLocalRepoMissing"
            class="mb-4"
            variant="warning"
          >
            <p>{{ t('heading.instance.advanced.git.localRepoMissing.banner') }}</p>

            <template
              v-if="canManageGit"
              #action
            >
              <AppButton
                :disabled="actionsDisabled"
                kind="primary"
                :loading="submitting.repair"
                size="small"
                @click="repairLocalRepository"
              >
                {{ ` ${t('heading.instance.advanced.git.localRepoMissing.repair')} ` }}
              </AppButton>
            </template>
          </AppMessage>

          <!-- Setup banner: until the first sync, Pull or Push (with `manage_git`), the diverged hint and the same-branch warning. -->
          <AppMessage
            v-if="showSetup"
            class="mb-4"
            variant="info"
          >
            <p>{{ t('heading.instance.advanced.git.setupBanner.message') }}</p>

            <p
              v-if="setupDivergedHint"
              class="mb-0 mt-3 text-gray-darken-1 body-2"
            >
              {{ setupDivergedHint }}
            </p>

            <p
              v-if="sameBranchWarning"
              class="mb-0 mt-3 text-warning body-2"
            >
              {{ sameBranchWarning }}

              <AppButton
                v-if="canManageGit"
                class="px-1 ml-1 git-btn-32"
                color="warning"
                :disabled="syncActionsDisabled"
                kind="link"
                size="x-small"
                @click="showBranchModal"
              >
                {{ t('heading.instance.advanced.git.setupBanner.changeBranch') }}
              </AppButton>
            </p>

            <template
              v-if="canManageGit"
              #action
            >
              <span
                v-if="setupBannerChecking"
                class="text-gray-darken-1 body-2"
              >
                {{ t('heading.instance.advanced.git.setupBanner.checking') }}
              </span>

              <template v-else-if="setupAction">
                <AppButton
                  v-if="setupAction !== 'push'"
                  class="mr-2"
                  :disabled="syncActionsDisabled"
                  kind="primary"
                  :loading="submitting.pull"
                  size="small"
                  @click="pullFromCard"
                >
                  {{ ` ${setupPullLabel} ` }}
                </AppButton>

                <AppButton
                  v-else
                  :disabled="syncActionsDisabled"
                  kind="primary"
                  :loading="submitting.push"
                  size="small"
                  @click="pushFromCard"
                >
                  {{ ` ${t('heading.instance.advanced.git.setupBanner.push')} ` }}
                </AppButton>
              </template>
            </template>
          </AppMessage>

          <!-- Connection card: title and Connect button, then the connect form in the second card text. -->
          <SettingCard
            :description="hostingUnsupported ? t('heading.instance.advanced.git.hostingUnsupported') : t('heading.instance.advanced.git.connect.subtitle')"
            :title="t('heading.instance.advanced.git.connect.title')"
          >
            <template
              v-if="showDisconnect || (!connected && canManageGit)"
              #action
            >
              <!-- Disconnect is shown without `manage_git`, Connect needs it.
                   Disconnect is also hidden when deploy manages the repository; Connect never shows for a connected project. -->
              <AppButton
                v-if="showDisconnect"
                :disabled="actionsDisabled"
                kind="danger"
                :loading="submitting.connect"
                @click="showDisconnectModal"
              >
                {{ ` ${t('button.disconnect.default')} ` }}
              </AppButton>

              <AppButton
                v-else-if="!connected && canManageGit && !isSshConnectForm"
                :disabled="hostingUnsupported || actionsDisabled"
                kind="primary"
                :loading="submitting.connect"
                @click="connectRepository"
              >
                {{ ` ${t('heading.instance.advanced.git.connect.button')} ` }}
              </AppButton>
            </template>

            <template #footer>
              <!-- The linked repository, the connection health alert and the token update. -->
              <template v-if="connected">
                <div class="mb-2">
                  <span class="text-gray-darken-1">{{ t('heading.instance.advanced.git.connected.repo') }}</span>

                  <a
                    v-if="connectedRepositoryHref"
                    class="ml-2 instance-domain-link"
                    :href="connectedRepositoryHref"
                    rel="noopener"
                    target="_blank"
                  >{{ gitStatus.repo_url }}</a>

                  <span
                    v-else
                    class="ml-2 font-weight-medium"
                  >{{ gitStatus.repo_url }}</span>
                </div>

                <AppMessage
                  v-if="connectionHealthIsError && connectionHealthMessage"
                  class="mt-5 mb-2 git-health-alert"
                  variant="error"
                >
                  <p>{{ connectionHealthMessage }}</p>
                </AppMessage>

                <!-- Legacy opened an inline token field here; the link opens the token dialog of the Access token card. -->
                <AppButton
                  v-if="connectionHealthIsError && connectionHealthReason === 'token' && canManageGit"
                  class="px-0 git-text-btn git-btn-32"
                  :disabled="actionsDisabled"
                  kind="text"
                  size="x-small"
                  @click="showTokenModal"
                >
                  {{ ` ${t('heading.instance.advanced.git.connection.updateToken')} ` }}
                </AppButton>
              </template>

              <template v-if="!hostingUnsupported && !connected">
                <v-btn-toggle
                  v-if="canReuse"
                  v-model="showManualConnectForm"
                  class="git-connect-mode-toggle mb-4"
                  density="compact"
                  mandatory
                >
                  <AppButton
                    :disabled="actionsDisabled"
                    size="small"
                    :value="false"
                  >
                    {{ t('heading.instance.advanced.git.repoMode.useRelated') }}
                  </AppButton>

                  <AppButton
                    :disabled="actionsDisabled"
                    size="small"
                    :value="true"
                  >
                    {{ t('heading.instance.advanced.git.repoMode.useDifferent') }}
                  </AppButton>
                </v-btn-toggle>

                <template v-if="reuseConnect">
                  <p class="mb-2 text-gray-darken-1">
                    {{ t('heading.instance.advanced.git.repoMode.reuseHint') }}
                  </p>

                  <div class="mb-2">
                    <span class="text-gray-darken-1">{{ t('heading.instance.advanced.git.connected.repo') }}</span>

                    <a
                      v-if="pairRepositoryHref"
                      class="ml-2 instance-domain-link"
                      :href="pairRepositoryHref"
                      rel="noopener"
                      target="_blank"
                    >{{ pairRepoUrl }}</a>

                    <span
                      v-else
                      class="ml-2 font-weight-medium"
                    >{{ pairRepoUrl }}</span>
                  </div>

                  <p
                    v-if="instance.parentInstance"
                    class="mb-0 caption text-gray-darken-1"
                  >
                    <template v-if="pairBranchLabel">
                      {{ t('heading.instance.advanced.git.repoMode.stagingBranchHint', { branch: pairBranchLabel }) }}
                    </template>

                    <template v-else>
                      {{ t('heading.instance.advanced.git.repoMode.stagingBranchHintDefault') }}
                    </template>
                  </p>
                </template>

                <template v-else>
                  <v-text-field
                    v-model="connectRepoUrl"
                    class="mb-2 git-field"
                    density="compact"
                    :disabled="actionsDisabled"
                    :error-messages="connectErrors.repoUrl"
                    :label="t('heading.instance.advanced.git.connect.repoUrl')"
                    variant="outlined"
                  />

                  <!-- The deployed lite page shows this hint under the URL field (the key is the onboarding one, `heading.onboarding.gitDeploy.repoUrl.sshHint`). -->
                  <div
                    v-if="!isSshConnectForm"
                    class="text-gray-darken-1 caption mb-2"
                  >
                    {{ t('heading.onboarding.gitDeploy.repoUrl.sshHint') }}
                  </div>

                  <div
                    v-if="!isSshConnectForm"
                    class="mb-2 d-flex align-center justify-space-between"
                  >
                    <span class="font-weight-medium text-gray-darken-1">
                      {{ t('heading.instance.advanced.git.connect.privateRepo') }}
                    </span>

                    <AppSwitch
                      v-model="connectIsPrivate"
                      class="ma-0 git-switch"
                      :disabled="actionsDisabled"
                      kind="inset"
                    />
                  </div>

                  <v-expand-transition>
                    <div
                      v-if="connectIsPrivate && !isSshConnectForm"
                      class="mb-2"
                    >
                      <v-text-field
                        v-model="connectPatToken"
                        class="mb-0 git-field"
                        density="compact"
                        :disabled="actionsDisabled"
                        :error-messages="connectErrors.patToken"
                        :label="t('heading.instance.advanced.git.connect.token')"
                        :type="showConnectToken ? 'text' : 'password'"
                        variant="outlined"
                      >
                        <template #append-inner>
                          <AppButton
                            :aria-label="showConnectToken ? t('button.secret.hide') : t('button.secret.show')"
                            :disabled="actionsDisabled"
                            kind="icon"
                            @click="showConnectToken = !showConnectToken"
                          >
                            <v-icon
                              color="gray"
                              :icon="showConnectToken ? '$eyeclosed' : '$eye'"
                              size="18"
                            />
                          </AppButton>
                        </template>
                      </v-text-field>

                      <FormFieldDocHint
                        class="mt-1"
                        :documentation-link="documentationLink"
                        :hint="t('heading.instance.advanced.git.connect.tokenHint')"
                        :link-text="t('message.link.documentation.howToCreate')"
                      />
                    </div>
                  </v-expand-transition>

                  <!-- An SSH address asks for the branch and a deploy key, no token. -->
                  <template v-if="isSshConnectForm && canManageGit">
                    <v-text-field
                      v-model="connectBranch"
                      class="mb-2 git-field"
                      density="compact"
                      :disabled="actionsDisabled"
                      :error-messages="connectErrors.branch"
                      :label="t('heading.onboarding.gitDeploy.branch.label')"
                      placeholder="main"
                      variant="outlined"
                    />

                    <AppButton
                      v-if="!sshDeployKey"
                      :disabled="actionsDisabled || sshKeyLoading"
                      kind="primary"
                      :loading="sshKeyLoading"
                      @click="generateDeployKeyForForm"
                    >
                      {{ ` ${t('button.onboarding.gitDeploy.generateDeployKey')} ` }}
                    </AppButton>

                    <!-- The key of the form, with Connect and deploy (the connect flow) and Generate a new key (the rotation). -->
                    <DeployKeyPanel
                      v-if="sshDeployKey"
                      :connect-label="t('button.onboarding.gitDeploy.connectAndDeploy')"
                      :error="sshConnectError"
                      :loading="submitting.connect"
                      :public-key="sshDeployKey.public_key"
                      show-regenerate
                      @connect="connectRepository"
                      @regenerate="showRotateKeyModal"
                    />
                  </template>
                </template>
              </template>
            </template>
          </SettingCard>

          <!-- Deploy key card: the key of the connected SSH repository, with its fingerprint. The buttons open the rotate and the delete dialogs. -->
          <SettingCard
            v-if="showConnectedKey"
            class="mt-4"
            :title="t('heading.onboarding.gitDeploy.auth.deployKey.label')"
          >
            <template #action>
              <div
                v-if="connectedKey"
                class="git-deploy-key-actions d-flex align-center flex-wrap"
              >
                <AppButton
                  :disabled="actionsDisabled"
                  kind="setting-action"
                  @click="showRotateKeyModal"
                >
                  <span class="font-weight-bold">{{ ` ${t('button.onboarding.gitDeploy.regenerateDeployKey')} ` }}</span>
                </AppButton>

                <AppButton
                  :disabled="actionsDisabled"
                  kind="setting-action"
                  @click="showDeleteKeyModal"
                >
                  <span class="font-weight-bold">{{ ` ${t('button.onboarding.gitDeploy.deleteDeployKey')} ` }}</span>
                </AppButton>
              </div>
            </template>

            <template #footer>
              <!-- The skeleton while the key of the connected repository loads; the order is loading, key, missing. -->
              <v-skeleton-loader
                v-if="connectedKeyLoading"
                class="bg-text git-key-skeleton"
                type="paragraph, actions"
              />

              <DeployKeyPanel
                v-else-if="connectedKey"
                :fingerprint="connectedKey.fingerprint || ''"
                hide-connect
                :public-key="connectedKey.public_key"
              />
              <!-- The key request failed; the message and Retry repeat the read, no toast. -->
              <div v-else-if="connectedKeyError">
                <p class="text-error mb-2">
                  {{ t('heading.onboarding.gitDeploy.auth.deployKey.loadFailed') }}
                </p>

                <AppButton
                  kind="setting-action"
                  @click="loadConnectedKey"
                >
                  <span class="font-weight-bold">{{ t('button.retry') }}</span>
                </AppButton>
              </div>
              <!-- No key yet for the connected repository; the button generates one for the stored address. -->
              <div v-else-if="connectedKeyLoaded">
                <p class="mb-3 text-gray-darken-1">
                  {{ t('heading.onboarding.gitDeploy.auth.deployKey.missing') }}
                </p>

                <AppButton
                  :disabled="actionsDisabled || connectedKeySubmitting"
                  kind="primary"
                  :loading="connectedKeySubmitting"
                  @click="generateConnectedKey"
                >
                  <span class="font-weight-bold">{{ ` ${t('button.onboarding.gitDeploy.generateDeployKey')} ` }}</span>
                </AppButton>
              </div>
            </template>
          </SettingCard>

          <!-- Branch card: the branch and the Manage button (with `manage_git`) that opens the branch dialog. -->
          <SettingCard
            v-if="connected"
            class="mt-4"
            :description="t('heading.instance.advanced.git.branch.subtitle')"
            :title="t('heading.instance.advanced.git.branch.title')"
          >
            <template #action>
              <span class="p-3 d-flex align-center text-gray-darken-2">
                {{ t('heading.instance.advanced.git.branch.status', { branch: gitStatus.branch || '—' }) }}
              </span>

              <AppButton
                v-if="canManageGit"
                :disabled="syncActionsDisabled"
                kind="setting-action"
                :loading="branchModalLoading"
                @click="showBranchModal"
              >
                <span class="font-weight-bold">{{ t('button.manage') }}</span>
              </AppButton>
            </template>
          </SettingCard>

          <!-- Access token card (a difference from legacy, built like the Branch card): whether the panel holds a token for the HTTPS
               repository, and the Manage button (with `manage_git`) that opens the token dialog. Auto-deploy registers the webhook with it. -->
          <SettingCard
            v-if="showTokenCard"
            class="mt-4"
            :description="t('heading.instance.advanced.git.token.subtitle')"
            :title="t('heading.instance.advanced.git.token.title')"
          >
            <template #action>
              <span class="p-3 d-flex align-center text-gray-darken-2">
                {{ hasToken ? t('heading.instance.advanced.git.token.saved') : t('heading.instance.advanced.git.token.missing') }}
              </span>

              <AppButton
                v-if="canManageGit"
                :disabled="actionsDisabled"
                kind="setting-action"
                :loading="submitting.credentials"
                @click="showTokenModal"
              >
                <span class="font-weight-bold">{{ t('button.manage') }}</span>
              </AppButton>
            </template>
          </SettingCard>

          <!-- Last commit card: the last deployed commit, with the check for updates (with `manage_git`). -->
          <SettingCard
            v-if="connected"
            class="mt-4"
            :description="t('heading.instance.advanced.git.lastCommit.subtitle')"
            :title="t('heading.instance.advanced.git.lastCommit.title')"
          >
            <template #action>
              <AppButton
                v-if="canManageGit"
                :disabled="actionsDisabled"
                kind="setting-action"
                :loading="submitting.check"
                @click="checkUpdates"
              >
                <span class="font-weight-bold">{{ t('heading.instance.advanced.git.lastCommit.checkUpdates') }}</span>
              </AppButton>
            </template>

            <template #footer>
              <div class="git-commit-details">
                <template v-if="lastCommitHasHash">
                  <v-row
                    class="git-kv-row"
                    dense
                  >
                    <v-col
                      class="text-gray-darken-1"
                      cols="12"
                      sm="3"
                    >
                      {{ t('heading.instance.advanced.git.lastCommit.hash') }}
                    </v-col>

                    <v-col
                      class="d-flex align-center"
                      cols="12"
                      sm="9"
                    >
                      <v-tooltip
                        close-delay="150"
                        location="bottom"
                        open-delay="150"
                      >
                        <template #activator="{ props: activatorProps }">
                          <span
                            class="font-weight-medium"
                            v-bind="activatorProps"
                          >{{ lastCommitShortHash }}</span>
                        </template>

                        <span>{{ gitStatus.last_deployed_commit_hash }}</span>
                      </v-tooltip>
                    </v-col>
                  </v-row>

                  <v-row
                    v-if="gitStatus.last_deployed_commit_message"
                    class="git-kv-row"
                    dense
                  >
                    <v-col
                      class="text-gray-darken-1"
                      cols="12"
                      sm="3"
                    >
                      {{ t('heading.instance.advanced.git.lastCommit.message') }}
                    </v-col>

                    <v-col
                      class="text-break"
                      cols="12"
                      sm="9"
                    >
                      {{ gitStatus.last_deployed_commit_message }}
                    </v-col>
                  </v-row>

                  <v-row
                    v-if="lastCommitDate"
                    class="git-kv-row"
                    dense
                  >
                    <v-col
                      class="text-gray-darken-1"
                      cols="12"
                      sm="3"
                    >
                      {{ t('heading.instance.advanced.git.lastCommit.date') }}
                    </v-col>

                    <v-col
                      cols="12"
                      sm="9"
                    >
                      {{ lastCommitDate }}
                    </v-col>
                  </v-row>
                </template>

                <p
                  v-else
                  class="mb-0 text-gray-darken-1"
                >
                  {{ t('heading.instance.advanced.git.lastCommit.empty') }}
                </p>
              </div>
            </template>
          </SettingCard>

          <!-- Auto-deploy card: the switch needs `manage_git`; it waits while a deploy is in progress. -->
          <SettingCard
            v-if="connected"
            class="mt-4"
            :description="t('heading.instance.advanced.git.autoDeploy.subtitle', { branch: gitStatus.branch || '—' })"
            :title="t('heading.instance.advanced.git.autoDeploy.title')"
          >
            <template
              v-if="autoDeployInProgress"
              #alert
            >
              <p class="mb-0 text-info body-2">
                {{ t('heading.instance.advanced.git.autoDeploy.inProgress') }}
              </p>
            </template>

            <template
              v-if="canManageGit"
              #action
            >
              <AppSwitch
                class="ma-0 git-switch"
                :disabled="actionsDisabled || autoDeployInProgress"
                kind="inset"
                :loading="submitting.autoDeploy"
                :model-value="autoDeployOn"
                @update:model-value="onAutoDeployToggle"
              />
            </template>
          </SettingCard>

          <!-- Pull card: the hint for a pair (parent or staging), the Pull button only with `manage_git`. -->
          <SettingCard
            v-if="connected"
            class="mt-4"
            :description="t('heading.instance.advanced.git.pull.card.subtitle')"
            :title="t('heading.instance.advanced.git.pull.card.title')"
          >
            <template
              v-if="showPullPushToLiveHint"
              #alert
            >
              <p class="mb-0 text-gray-darken-1 body-2">
                {{ t('heading.instance.advanced.git.pull.pushToLiveHint') }}
              </p>
            </template>

            <template #action>
              <AppButton
                v-if="canManageGit"
                :disabled="syncActionsDisabled"
                kind="primary"
                :loading="submitting.pull"
                @click="pullFromCard"
              >
                {{ ` ${t('button.git.pull')} ` }}
              </AppButton>
            </template>
          </SettingCard>

          <!-- Push card: the hint that the pull comes first while the remote is ahead; Push waits for it. -->
          <SettingCard
            v-if="connected"
            class="mt-4"
            :description="t('heading.instance.advanced.git.push.card.subtitle')"
            :title="t('heading.instance.advanced.git.push.card.title')"
          >
            <template
              v-if="remoteAhead"
              #alert
            >
              <p class="mb-0 text-warning body-2">
                {{ t('heading.instance.advanced.git.push.pullFirstHint') }}
              </p>
            </template>

            <template #action>
              <AppButton
                v-if="canManageGit"
                :disabled="syncActionsDisabled || remoteAhead"
                kind="primary"
                :loading="submitting.push"
                @click="pushFromCard"
              >
                {{ ` ${t('button.git.push')} ` }}
              </AppButton>
            </template>
          </SettingCard>

          <!-- Logs card: the table is the card (kit DataTable), the title and the divider sit in its `top` slot. -->
          <GitLogsTable
            v-if="connected"
            class="mt-4"
            :items="logs"
            :loading="logsLoading"
            :page="logsPage"
            :per-page="logsPerPage"
            :total="logsTotal"
            @update:page="changeLogsPage"
            @update:per-page="changeLogsPerPage"
          >
            <template #top>
              <v-card-text class="pb-6 text-gray-darken-2">
                <h6>{{ t('heading.instance.advanced.git.logs.title') }}</h6>

                <p class="mb-0 mt-1">
                  {{ t('heading.instance.advanced.git.logs.subtitle') }}
                </p>
              </v-card-text>

              <v-divider />
            </template>
          </GitLogsTable>
        </template>
      </v-col>
    </AdvancedPageLayout>

    <!-- The redeploy modal, opened after an SSH connect. -->
    <git-redeploy-modal
      ref="redeployModal"
      :instance="instance"
      @reload-instance="onRedeployReload"
    />

    <action-modal-host
      :modal="modal"
      :open="modalOpen"
      :persistent="modalPersistent"
      :render="modalRender"
      :submitting="modalSubmitting"
      :values="modalValues"
      :width="modal?.width"
      @button="onModalButton"
      @close="modalClose"
      @update:values="setModalValues"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { ConnectFieldErrors } from './git-status'
  // The loading steps live in `use-git-page.ts`, the pure rules in `git-status.ts`.
  import type { Translate } from '@/shared/ui/modal/action-modal'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, toRef, useTemplateRef, watch } from 'vue'
  import AdvancedPageLayout from '@/views/projects/project/advanced/ui/AdvancedPageLayout.vue'
  import GitRedeployModal from '@/views/projects/project/general/modals/GitRedeployModal.vue'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import DeployKeyPanel from '@/entities/project/ui/deploy/DeployKeyPanel.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import { fromNow } from '@/shared/time/from-now'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'
  import FormFieldDocHint from '@/shared/ui/form/FormFieldDocHint.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import { useActionModal } from '@/shared/ui/modal/use-action-modal'
  import SettingCard from '@/shared/ui/setting-card/SettingCard.vue'
  import {
    buildBranchModal,
    buildDisconnectModal,
    buildPullDirtyModal,
    buildPushFirstModal,
    buildTokenModal,
    type GitActionDeps,
    runChangeBranch,
    runCheckUpdates,
    runDisconnect,
    runIgnoreDrift,
    runPull,
    runPush,
    runRepair,
    runRevert,
    runSetAutoDeploy,
    runUpdateCredentials,
  } from './git-actions'
  import { buildDeleteKeyModal, buildRotateKeyModal } from './git-deploy-key'
  import {
    canReuseConnection,
    connectFieldErrors,
    connectFieldRefusal,
    connectionHealthMessageKey,
    connectPayload,
    connectReplacesSiteFiles,
    connectSyncFailure,
    gitActionDisabled,
    gitPair,
    gitSyncActionDisabled,
    hasAccessToken,
    hasLastCommit,
    hasRemoteStatus,
    isAutoDeployInProgress,
    isConnectionHealthError,
    isDiverged,
    isRemoteAheadOfSite,
    isSameBranchAsPair,
    isSshConnect,
    lastCommitDeployedAt,
    setupBannerAction,
    shortHash,
    showAccessTokenCard,
    showDeployKeyCard,
    showDriftBanner,
    showLocalRepoMissingBanner,
    showSetupBanner,
    toRepositoryHref,
  } from './git-status'
  import { changeBranch, connectGit, disconnectGit, getGitBranches, ignoreGitDrift, pullGit, pushGit, repairGit, revertGit, setAutoDeploy, updateGitCredentials } from './git.api'
  import GitCardSkeleton from './GitCardSkeleton.vue'
  import GitLogsTable from './GitLogsTable.vue'
  import { useGitDeployKey } from './use-git-deploy-key'
  import { useGitPage } from './use-git-page'

  const props = defineProps<{
    instance: InstanceResource
  }>()
  // The frame asks for the instance again after an SSH connect (`InstanceView.vue` listens).
  const emit = defineEmits<{ 'reload-instance': [] }>()
  const redeployModal = useTemplateRef<InstanceType<typeof GitRedeployModal>>('redeployModal')

  const { t } = useTranslation()
  const translate: Translate = (key, options) => String(t(key, options as never))
  const alerts = useAlertsStore()
  const session = useSessionStore()
  // `store.state.home.app.documentation_link`, passed to the form hint (the kit does not read the session).
  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))
  const {
    gitStatus,
    loading,
    hostingUnsupported,
    setupBannerChecking,
    setupBannerChecked,
    submitting,
    setSubmitting,
    fetchGitStatus,
    refreshGitStatus,
    fetchGitLogs,
    bootstrap,
    startPolling,
    logs,
    logsTotal,
    logsLoading,
    logsPage,
    logsPerPage,
    changeLogsPage,
    changeLogsPerPage,
  } = useGitPage(toRef(props, 'instance'))

  const connected = computed(() => gitStatus.value.connected === true)
  // The Engine refuses disconnect for a repository managed by deploy (422), so the button is hidden for it.
  const deployManaged = computed(() => gitStatus.value.managed_by === 'deploy')
  const showDisconnect = computed(() => connected.value && !deployManaged.value)
  const canManageGit = computed(() => props.instance.hasManageGitPrivilege())
  // The requests and alerts of the actions, passed to the runners of `git-actions.ts`.
  const actionDeps: GitActionDeps = {
    disconnectGit,
    updateGitCredentials,
    fetchGitStatus,
    refreshGitStatus,
    fetchGitLogs,
    changeBranch,
    setAutoDeploy,
    pullGit,
    pushGit,
    revertGit,
    ignoreGitDrift,
    repairGit,
    closeModal: () => modalClose(),
    addSuccessAlert: message => alerts.addAlert({ success: true, successMessage: message }),
    addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
    getErrorMessage,
    setSubmitting,
    t: translate,
  }

  // The one dialog of the page hosted by `ActionModalHost` as on the backups screen.
  const {
    modal,
    modalOpen,
    submitting: modalSubmitting,
    render: modalRender,
    values: modalValues,
    persistent: modalPersistent,
    open: openModal,
    close: modalClose,
    setValues: setModalValues,
    onButton: onModalButton,
  } = useActionModal<null>({
    'git-disconnect': {
      async run (_values, ctx) {
        // The dialog closes after the request, on success and on failure; `runDisconnect` reports both (the error toast on failure).
        await runDisconnect(props.instance.id, actionDeps)
        ctx.close()
      },
    },
    'git-branch': {
      // The dialog closes inside the runner, after the request succeeds; a dirty tree opens the pull dialog.
      async run (values, ctx) {
        if (await runChangeBranch(props.instance.id, values, actionDeps) === 'dirty') {
          ctx.open(buildPullDirtyModal(gitStatus.value, translate))
        }
      },
    },
    'git-token': {
      // The status from the response replaces the page's one, and the
      // dialog closes; a failure keeps it open with the error toast.
      async run (values, ctx) {
        const token = String(values.token ?? '').trim()
        if (!token) {
          return
        }
        const status = await runUpdateCredentials(props.instance.id, token, actionDeps)
        if (status) {
          gitStatus.value = status
          ctx.close()
        }
      },
    },
    'git-pull-dirty': {
      // The clicked button picks the request. A pull that now finds a missing
      // remote branch replaces the dialog with the push-first one, as legacy did.
      async run (_values, ctx) {
        if (ctx.button === 'revert') {
          if (await runRevert(props.instance.id, actionDeps)) {
            ctx.close()
          }
          return
        }
        const strategy = ctx.button === 'force' ? 'force' : 'push_first'
        if (await runPull(props.instance.id, strategy, actionDeps) === 'push-first') {
          ctx.open(buildPushFirstModal(translate))
        }
      },
    },
    'git-push-first': {
      // Confirm closes the dialog and pushes; the push shows its own busy state.
      busy: false,
      async run (_values, ctx) {
        ctx.close()
        await runPush(props.instance.id, gitStatus.value, actionDeps)
      },
    },
    'git-deploy-key-delete': {
      // The dialog closes after the request, on success and on failure; `deleteKey` reports both.
      async run (_values, ctx) {
        await deleteKey()
        ctx.close()
      },
    },
    'git-deploy-key-rotate': {
      // The dialog closes after the request, on success and on failure; `rotateKey` reports both.
      async run (_values, ctx) {
        await rotateKey()
        ctx.close()
      },
    },
  })

  function showDisconnectModal (): void {
    openModal(buildDisconnectModal(translate))
  }

  /** The warning dialog of the key card's delete button. */
  function showDeleteKeyModal (): void {
    openModal(buildDeleteKeyModal(translate))
  }

  /** The warning dialog of the key card's regenerate button. */
  function showRotateKeyModal (): void {
    openModal(buildRotateKeyModal(translate))
  }

  /**
   * The branch list is read first, then the dialog opens. A failed read gives
   * the text field, without a toast. Manage shows the loader while the list loads (legacy has none) and ignores repeated clicks.
   */
  const branchModalLoading = ref(false)

  async function showBranchModal (): Promise<void> {
    if (branchModalLoading.value) {
      return
    }
    branchModalLoading.value = true
    let branches: string[] | null = null
    try {
      branches = await getGitBranches(props.instance.id)
    } catch {
      branches = null
    } finally {
      branchModalLoading.value = false
    }
    openModal(buildBranchModal(branches, gitStatus.value.branch, translate))
  }

  const actionFlags = computed(() => ({
    submitting,
    setupBannerChecking: setupBannerChecking.value,
    modalSubmitting: modalSubmitting.value,
  }))
  const actionsDisabled = computed(() => gitActionDisabled(actionFlags.value))
  // The Manage and Pull/Push actions also wait for a local repository.
  const syncActionsDisabled = computed(() => gitSyncActionDisabled(actionFlags.value, gitStatus.value))

  const lastCommitHasHash = computed(() => hasLastCommit(gitStatus.value))
  const lastCommitShortHash = computed(() => shortHash(gitStatus.value.last_deployed_commit_hash))
  const formatDate = useDateFormat()
  const lastCommitDate = computed(() => lastCommitDeployedAt(gitStatus.value.last_deployed_commit_at, formatDate, fromNow))
  const autoDeployInProgress = computed(() => isAutoDeployInProgress(gitStatus.value))

  // The push waits for the pull, and the Push card says so.
  const remoteAhead = computed(() => isRemoteAheadOfSite(gitStatus.value))
  // The pair (parent or staging) is what the pull goes live from.
  const showPullPushToLiveHint = computed(() => Boolean(props.instance.parentInstance))

  // Banners. The pure rules live in `git-status.ts`; the busy flags are the page's (`submitting`).
  const showDrift = computed(() => showDriftBanner(gitStatus.value))
  const showLocalRepoMissing = computed(() => showLocalRepoMissingBanner(gitStatus.value))
  const showSetup = computed(() => showSetupBanner(gitStatus.value))
  const setupAction = computed(() => setupBannerAction(gitStatus.value))
  const setupPullLabel = computed(() => (setupAction.value === 'pull-behind'
    ? t('heading.instance.advanced.git.setupBanner.pullBehind', { count: Number(gitStatus.value.commits_behind || 0) })
    : t('heading.instance.advanced.git.setupBanner.pull')))
  // Diverged gets its own hint, otherwise the remote-ahead hint says to pull first.
  const driftHint = computed(() => {
    if (!remoteAhead.value) {
      return null
    }
    return isDiverged(gitStatus.value)
      ? t('heading.instance.advanced.git.drift.divergedHint')
      : t('heading.instance.advanced.git.push.pullFirstHint')
  })
  const setupDivergedHint = computed(() => (hasRemoteStatus(gitStatus.value) && isDiverged(gitStatus.value)
    ? t('heading.instance.advanced.git.setupBanner.divergedHint')
    : null))
  // The staging copy for a pair's child, the live copy for a live instance with stagings.
  const sameBranchWarning = computed(() => {
    if (!isSameBranchAsPair(gitStatus.value, props.instance)) {
      return null
    }
    const branch = (gitStatus.value.branch || '').trim()
    return props.instance.parentInstance
      ? t('heading.instance.advanced.git.setupBanner.sameBranchStaging', { branch })
      : t('heading.instance.advanced.git.setupBanner.sameBranchLive', { branch })
  })

  async function revertFromDrift (): Promise<void> {
    if (submitting.revert) {
      return
    }
    await runRevert(props.instance.id, actionDeps)
  }

  async function ignoreDrift (): Promise<void> {
    if (submitting.ignoreDrift) {
      return
    }
    await runIgnoreDrift(props.instance.id, actionDeps)
  }

  async function repairLocalRepository (): Promise<void> {
    if (submitting.repair) {
      return
    }
    await runRepair(props.instance.id, actionDeps)
  }

  /**
   * A dirty tree or a missing remote branch opens its dialog
   * here, after the request has ended, as legacy did.
   */
  async function pullFromCard (): Promise<void> {
    if (submitting.pull) {
      return
    }
    const outcome = await runPull(props.instance.id, undefined, actionDeps)
    if (outcome === 'dirty') {
      openModal(buildPullDirtyModal(gitStatus.value, translate))
    } else if (outcome === 'push-first') {
      openModal(buildPushFirstModal(translate))
    }
  }

  async function pushFromCard (): Promise<void> {
    if (submitting.push) {
      return
    }
    await runPush(props.instance.id, gitStatus.value, actionDeps)
  }

  async function checkUpdates (): Promise<void> {
    if (submitting.check) {
      return
    }
    await runCheckUpdates(actionDeps)
  }

  /**
   * The switch's own state. It follows the status, and a toggle writes it before and after the request: a refused toggle puts the control
   * back to the server state even when that is the value it had before the click, where the bound status alone left the input checked (`v-switch`
   * keeps its native checked flag while the value it is bound to does not change) and the switch read "on" to a screen reader.
   */
  const autoDeployOn = ref(false)
  watch(() => gitStatus.value.auto_deploy_enabled, value => {
    autoDeployOn.value = value === true
  }, { immediate: true })

  /**
   * The response status replaces the page's one, and an auto-deploy that is in
   * progress starts the poll. A failure already refetched the status, so the switch shows the server state again.
   */
  async function onAutoDeployToggle (enabled: boolean | null): Promise<void> {
    if (submitting.autoDeploy) {
      return
    }

    autoDeployOn.value = enabled === true
    const status = await runSetAutoDeploy(props.instance.id, enabled === true, actionDeps)
    if (status) {
      gitStatus.value = status
      autoDeployOn.value = status.auto_deploy_enabled === true
      if (isAutoDeployInProgress(status)) {
        startPolling()
      }
    } else {
      autoDeployOn.value = gitStatus.value.auto_deploy_enabled === true
    }
  }

  const connectedRepositoryHref = computed(() => toRepositoryHref(gitStatus.value.repo_url))
  const connectionHealthIsError = computed(() => isConnectionHealthError(gitStatus.value))
  const connectionHealthReason = computed(() => gitStatus.value.connection_health?.reason || null)
  const connectionHealthMessage = computed(() => {
    const key = connectionHealthMessageKey(gitStatus.value)
    return key ? translate(key) : null
  })

  // The Access token card and its dialog (legacy had an
  // inline field behind the health alert's link).
  const showTokenCard = computed(() => showAccessTokenCard(gitStatus.value))
  const hasToken = computed(() => hasAccessToken(gitStatus.value))

  function showTokenModal (): void {
    openModal(buildTokenModal(translate))
  }

  const pair = computed(() => gitPair(props.instance))
  const canReuse = computed(() => canReuseConnection(props.instance))
  const pairRepoUrl = computed(() => pair.value?.git_repository?.repo_url || '')
  const pairRepositoryHref = computed(() => toRepositoryHref(pairRepoUrl.value))
  const pairBranchLabel = computed(() => (pair.value?.git_repository?.branch || '').trim() || null)

  const showManualConnectForm = ref(false)
  const reuseConnect = computed(() => canReuse.value && !showManualConnectForm.value)
  const connectRepoUrl = ref('')
  const connectIsPrivate = ref(false)
  const connectPatToken = ref('')
  const connectBranch = ref('main')
  const showConnectToken = ref(false)
  const connectErrors = ref<ConnectFieldErrors>({ repoUrl: [], patToken: [], branch: [] })

  // The connected repository with an SSH address
  // shows its key, and so does any project whose current key the Engine answered (a key made before the connect).
  const readDeployKey = computed(() => canManageGit.value && !loading.value && !hostingUnsupported.value)
  const normalizedConnectRepoUrl = computed(() => connectRepoUrl.value.trim())
  // On the form, the SSH address hides the token and the hint, and shows the branch and the key.
  const isSshConnectForm = computed(() => isSshConnect({ connected: connected.value, reuse: reuseConnect.value, repoUrl: connectRepoUrl.value }))
  const { connectedKey, connectedKeyError, connectedKeyLoading, connectedKeyLoaded, connectedKeySubmitting, deleteKey, generateConnectedKey, generateSshKey, loadConnectedKey, resetSshKey, rotateKey, sshConnectError, sshDeployKey, sshKeyLoading } = useGitDeployKey({
    instanceId: () => props.instance.id,
    gitStatus,
    connected,
    readKey: readDeployKey,
    repoUrl: normalizedConnectRepoUrl,
    alerts: { addSuccessAlert: actionDeps.addSuccessAlert, addErrorAlert: actionDeps.addErrorAlert },
    t: translate,
  })

  const showConnectedKey = computed(() => showDeployKeyCard(gitStatus.value, canManageGit.value, connectedKey.value !== null))

  // An edit clears the error of its own field, switching the mode clears both.
  watch(connectRepoUrl, () => {
    connectErrors.value = { ...connectErrors.value, repoUrl: [] }
    resetSshKey()
  })
  watch(connectBranch, () => {
    connectErrors.value = { ...connectErrors.value, branch: [] }
  })
  watch(connectPatToken, () => {
    connectErrors.value = { ...connectErrors.value, patToken: [] }
  })
  watch(connectIsPrivate, isPrivate => {
    if (!isPrivate) {
      connectErrors.value = { ...connectErrors.value, patToken: [] }
    }
  })
  watch(showManualConnectForm, () => {
    connectErrors.value = { repoUrl: [], patToken: [], branch: [] }
  })

  /** Errors are shown on submit only. */
  function applyConnectValidation (): boolean {
    connectErrors.value = connectFieldErrors({
      connected: connected.value,
      reuse: reuseConnect.value,
      repoUrl: connectRepoUrl.value,
      isPrivate: connectIsPrivate.value,
      patToken: connectPatToken.value,
      branch: connectBranch.value,
    }, t)
    return connectErrors.value.repoUrl.length === 0 && connectErrors.value.patToken.length === 0 && connectErrors.value.branch.length === 0
  }

  /** The URL field gets the error of the request. */
  function generateDeployKeyForForm (): void {
    void generateSshKey(applyConnectValidation, message => {
      connectErrors.value = { ...connectErrors.value, repoUrl: message ? [message] : [] }
    })
  }

  // The modal reads the bound branch from the instance prop, so the
  // redeploy waits for the frame to reload the instance after the SSH connect (at most 5 s).
  function waitForConnectedInstance (): Promise<void> {
    const isReady = () => props.instance.git_repository?.connected === true
    if (isReady()) {
      return Promise.resolve()
    }
    return new Promise(resolve => {
      const unwatch = watch(isReady, ready => {
        if (ready) {
          unwatch()
          clearTimeout(timer)
          resolve()
        }
      })
      const timer = setTimeout(() => {
        unwatch()
        resolve()
      }, 5000)
    })
  }

  /** The redeploy modal opens after a successful SSH connect. */
  async function openRedeployAfterConnect (): Promise<void> {
    await waitForConnectedInstance()
    await redeployModal.value?.open()
  }

  /** The modal asks for the instance again, then the status and the logs. */
  async function onRedeployReload (): Promise<void> {
    emit('reload-instance')
    await fetchGitStatus({ silent: true })
    await fetchGitLogs()
  }

  /** Reset after a connect that counts as done. */
  function resetConnectForm (): void {
    connectRepoUrl.value = ''
    connectIsPrivate.value = false
    connectPatToken.value = ''
    connectBranch.value = 'main'
    showManualConnectForm.value = false
    setupBannerChecked.value = false
    resetSshKey()
    connectErrors.value = { repoUrl: [], patToken: [], branch: [] }
  }

  async function connectRepository (): Promise<void> {
    if (submitting.connect) {
      return
    }

    if (!applyConnectValidation()) {
      return
    }

    // The mode is read before the request, the SSH branch is trimmed from the field.
    const ssh = isSshConnectForm.value
    const sshBranch = connectBranch.value.trim()
    // Read before the request and its status refetch: the answer does not say whether the Engine wrote the files.
    const replacesSiteFiles = connectReplacesSiteFiles(gitStatus.value)
    sshConnectError.value = null
    setSubmitting('connect', true)
    try {
      const result = await connectGit(props.instance.id, connectPayload({
        connected: connected.value,
        reuse: reuseConnect.value,
        repoUrl: connectRepoUrl.value,
        isPrivate: connectIsPrivate.value,
        patToken: connectPatToken.value,
        branch: connectBranch.value,
      }, pair.value))
      const branchMissing = ssh && result.branchMissing
      resetConnectForm()
      await fetchGitStatus({ silent: true })
      if (ssh) {
        emit('reload-instance')
      }
      if (branchMissing) {
        // The key is in place, but the repository has no such branch: the page asks for another one.
        alerts.addAlert({ success: false, errorMessage: t('heading.onboarding.gitDeploy.branchMissing', { branch: sshBranch }) })
        void showBranchModal()
        return
      }
      alerts.addAlert({
        success: true,
        successMessage: t(replacesSiteFiles
          ? 'notification.instance.git.connect.synced'
          : 'notification.instance.git.connect.success'),
      })
      if (ssh) {
        // An SSH connect that succeeded opens the redeploy modal.
        await openRedeployAfterConnect()
      }
    } catch (error) {
      const failure = connectSyncFailure(error)
      if (failure) {
        // The repository is connected, the first sync failed: the server message is shown as it is.
        resetConnectForm()
        await fetchGitStatus({ silent: true })
        alerts.addAlert({
          success: true,
          successMessage: failure.message
            ? t('heading.instance.advanced.git.connect.partialSyncFailed', { message: failure.message })
            : t('notification.instance.git.connect.success'),
        })
      } else if (ssh) {
        // An SSH connect error stays under the key panel, without a toast.
        sshConnectError.value = getErrorMessage(error) || t('heading.instance.advanced.git.connect.failed')
      } else {
        const refusal = connectFieldRefusal(error)
        if (refusal) {
          connectErrors.value = refusal
        }
        alerts.addAlert({
          success: false,
          errorMessage: getErrorMessage(error) || t('heading.instance.advanced.git.connect.failed'),
        })
      }
    } finally {
      setSubmitting('connect', false)
    }
  }

  onMounted(() => {
    void bootstrap()
  })
</script>

<style lang="scss" scoped>
// The inline `style="gap: 8px"` of legacy is moved to the class (the page owns its layout).
.git-deploy-key-actions {
  gap: 8px;
}

// Ported 1:1: `::v-deep` becomes `:deep()`, `> .col` becomes `> .v-col`.
.git-connect-mode-toggle {
  display: flex;
  width: 100%;
  // V2 `.v-btn-toggle` is two 38px buttons in a 1px border (40px) on a white (light) / sheet (dark) background; V4 is 36px and transparent.
  height: 40px;
  background-color: var(--v-sheet-surface);
  border: 1px solid var(--v-gray-lighten2);
  border-radius: 8px;
  overflow: hidden;

  :deep(.v-btn) {
    flex: 1 1 0;
    min-width: 0;
    height: 38px;
    border: none;
    border-radius: 0;
    text-transform: none;
    letter-spacing: normal;

    &:not(:last-child) {
      border-right: 1px solid var(--v-gray-lighten2);
    }
  }
}

// V2 generated the minimum width of a default button from `$btn-sizes`: 71px (V4 72px). `_buttons.scss` restates it only for the white
// `.v-btn--default` button, so the short labels of this page ("Pull") would be 1px wide otherwise.
.advanced-page :deep(.v-btn.v-btn--size-default) {
  min-width: 71px;
}

// V2 `text-gray-darken-1` is not a V2 class (it only exists in V4), so the banner paragraphs of the deployed page inherit the alert colour:
// the class is left off them, and `AppMessage` gives paragraphs the variant colour. The setup banner hints keep it. A V4 text button inherits the card text colour (.6), V2 painted `rgba(0, 0, 0, 0.87)`; the x-small / small
// text buttons keep their 32px height (V4 x-small is 24px).
.git-text-btn {
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.v-theme--dark .git-text-btn {
  color: rgb(var(--v-theme-on-surface));
}

.git-btn-32 {
  height: 32px;
}

// V2 `outlined dense`: the slot is the native input's 25px line plus 8px paddings (41px) with a 14px message area pulled up by its margins
// (root 43px, 49px with one message), where the global `_inputs.scss` gives a V4 field 48px.
.git-field :deep(.v-field) {
  min-height: 0;
}

.git-field {

  // V2 slot margin 4px, of which 2px remain once the 14px details area (pulled up by its margins) is a grid row of its own; `_inputs.scss`
  // raises the field margin to 8px while a message shows.
  :deep(.v-input__control) {
    margin-bottom: 2px;
  }

  &:has(.v-messages__message) :deep(.v-input__control > .v-field) {
    margin-bottom: 2px;
  }

  :deep(.v-input__details) {
    min-height: 14px;
    padding-top: 0;
    margin: -4px 0 -12px;
  }
}

// Legacy `.row` is `margin: -16px` and `.col` padding 16px (`_general.scss`), also on `row--dense`: the legacy rule for the key/value
// columns (padding 2px, line-height 1.35) does not apply on the deployed lite page (measured: padding 16px, 22px
// line), so it is not ported; V4 `.v-row` spaces columns with `gap`, hence the numbers are restated.
.git-commit-details .git-kv-row {
  margin: 0 -16px -16px;
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;

  > .v-col {
    padding: 16px;
  }
}

// Skeleton: V2 text bones carry a 6px bottom margin, V4 a 16px margin on every side (card 25px too high).
.git-key-skeleton {
  color: inherit;
}

.git-key-skeleton :deep(.v-skeleton-loader__text) {
  margin: 0 0 8px;
}
</style>
