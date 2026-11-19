<template>
  <OnboardingDialog
    data-testid="onboarding-deploy-git-modal"
    :model-value="isOpen"
  >
    <OnboardingCard
      v-if="isOpen"
      :close-disabled="loading || connecting"
      @close="cancel"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <div class="d-flex flex-column">
            <span class="font-weight-light p-1">
              {{ t('heading.onboarding.gitDeploy.title') }}
            </span>

            <h4>{{ t('heading.onboarding.gitDeploy.subtitle') }}</h4>
          </div>
        </div>

        <v-divider class="mb-5" />

        <div class="form-box">
          <p class="caption text-gray-darken-1 mb-4">
            {{ t('heading.onboarding.gitDeploy.repoUrl.protocolInfo') }}
          </p>

          <div>
            <span
              class="text-gray-darken-1 mb-1"
              :class="errorMessage ? 'text-error' : ''"
            >
              {{ t('heading.onboarding.gitDeploy.repoUrl.label') }}
            </span>

            <v-text-field
              v-model="repoUrl"
              autofocus
              class="mt-2 v-input--md"
              density="compact"
              :disabled="connecting || !!project"
              :error="!!errorMessage"
              placeholder="https://"
              variant="outlined"
              @keydown.enter.prevent="submit"
            />
          </div>

          <div
            v-if="!isSsh"
            class="mt-4 d-flex align-center justify-space-between"
          >
            <span class="font-weight-medium text-gray-darken-1">
              {{ t('heading.onboarding.gitDeploy.privateRepo.label') }}
            </span>

            <AppSwitch
              v-model="isPrivate"
              class="ma-0"
              :disabled="connecting"
              kind="inset"
            />
          </div>

          <v-expand-transition>
            <div
              v-if="isPrivate && !isSsh"
              class="mt-4"
            >
              <span class="text-gray-darken-1 mb-1 d-block">
                {{ t('heading.onboarding.gitDeploy.auth.pat.tokenLabel') }}
              </span>

              <v-text-field
                v-model="token"
                class="mt-2 mb-0 v-input--md"
                density="compact"
                :disabled="connecting"
                hide-details
                :placeholder="t('heading.onboarding.gitDeploy.auth.pat.placeholder')"
                :type="showToken ? 'text' : 'password'"
                variant="outlined"
                @keydown.enter.prevent="submit"
              >
                <template #append-inner>
                  <AppButton
                    :aria-label="showToken ? t('button.secret.hide') : t('button.secret.show')"
                    icon
                    size="x-small"
                    @click="showToken = !showToken"
                  >
                    <v-icon
                      color="gray"
                      :icon="showToken ? '$eyeclosed' : '$eye'"
                      size="18"
                    />
                  </AppButton>
                </template>
              </v-text-field>

              <FormFieldDocHint
                class="mt-1"
                :documentation-link="documentationLink"
                :link-text="t('message.link.documentation.howToCreate')"
              />
            </div>
          </v-expand-transition>

          <div
            v-if="isSsh"
            class="ssh-branch"
          >
            <span class="text-gray-darken-1 mb-1 d-block">
              {{ t('heading.onboarding.gitDeploy.branch.label') }}
            </span>

            <v-text-field
              v-model="sshBranch"
              class="mt-2 v-input--md"
              density="compact"
              :disabled="connecting"
              hide-details
              placeholder="main"
              variant="outlined"
              @keydown.enter.prevent="submit"
            />

            <p
              v-if="!project"
              class="text-gray-darken-1 mt-3 mb-0"
            >
              {{ t('heading.onboarding.gitDeploy.projectCreatedNow') }}
            </p>
          </div>

          <div
            v-if="isSsh && deployKey"
            class="mt-4"
          >
            <p class="text-gray-darken-1">
              {{ t('heading.onboarding.gitDeploy.auth.deployKey.continueMessage') }}
            </p>

            <DeployKeyPanel
              :error="connectError"
              hide-connect
              :loading="connecting"
              :public-key="deployKey.public_key"
            />

            <Checkbox
              v-model="keyAdded"
              class="key-added mt-3"
              color="primary"
              :disabled="connecting"
              :label="t('heading.onboarding.gitDeploy.auth.deployKey.addedCheckbox')"
            />
          </div>
        </div>

        <v-scale-transition>
          <div
            v-if="connecting && statusMessage"
            class="status-box mt-5"
          >
            <v-progress-circular
              class="mr-3"
              color="primary"
              indeterminate
              size="18"
              width="2"
            />

            <span class="text-gray-darken-1">{{ statusMessage }}</span>
          </div>
        </v-scale-transition>

        <v-scale-transition>
          <AppMessage
            v-if="errorMessage && !connecting"
            class="mt-5"
            icon="$alertcircle"
            variant="error"
          >
            <b>
              <i18next :translation="t('message.alert.failed')">
                <template #message>
                  <span class="font-weight-medium">{{ errorMessage }}</span>
                </template>
              </i18next>
            </b>
          </AppMessage>
        </v-scale-transition>
      </v-card-text>

      <OnboardingStepFooter
        :back-disabled="loading || connecting"
        :back-label="t('button.cancel')"
        :loading="loading || connecting"
        :max-steps="4"
        :next-disabled="isSsh && deployKey ? !keyAdded || connecting : !isContinueAllowed || connecting"
        :step="2"
        @back="cancel"
        @next="isSsh && deployKey ? connectSsh() : submit()"
      >
        <template #next>
          <span
            v-if="isSsh && !deployKey"
            class="font-weight-bold"
          >
            {{ ' ' + t('button.onboarding.gitDeploy.generateDeployKey') + ' ' }}
          </span>

          <span
            v-else
            class="font-weight-bold"
          >
            {{ ' ' + t('button.continue') }}

            <v-icon
              class="ml-2 mr-0"
              icon="$arrowright"
              size="20"
            />
          </span>
        </template>
      </OnboardingStepFooter>
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { GitDeploy } from '@/views/onboarding/onboarding.store'
  // The connect sequence and its
  // rules are in `git-deploy.ts`; the SSH (deploy key) branch is in `git-ssh-launch.ts`. This modal keeps the form, the spinner and the error box.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { canContinue, connectGitRepo, type GitConnectStatus } from '@/views/onboarding/git-deploy'
  import { isSshRepoUrl } from '@/views/onboarding/git-ssh-launch'
  import { connectGitSsh, createDeployKey, type DeployKeyResult, type EnvExamplePreview, getEnvExampleSsh, getGitBranches, getGitBranchesSsh, previewEnvExample, testGitUrl } from '@/views/onboarding/onboarding.api'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import DeployKeyPanel from '@/entities/project/ui/deploy/DeployKeyPanel.vue'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import FormFieldDocHint from '@/shared/ui/form/FormFieldDocHint.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    /** The flow's `submitting`: the continue button and the controls wait for it. */
    loading?: boolean
    /** The service the deploy key project is created on (SSH only). */
    serviceId?: number | string | null
    /** The domain of the install, `null` when there is none (SSH only). */
    domainId?: number | string | null
    /** The e-mails of the users invited on the share step (SSH only). */
    sharedAccess?: string[]
  }>(), {
    loading: false,
    serviceId: null,
    domainId: null,
    sharedAccess: () => [],
  })

  const emit = defineEmits<{
    'remove-modal': []
    'next': [deploy: GitDeploy]
    /** The deploy key project exists, announced before the key is added to the repo. */
    'deploy-key-created': [payload: { project: Record<string, unknown> }]
    /** The key step is left before the connect: the project the request created is removed with the step. */
    'cancel-created-project': []
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  // The documentation link, passed to the form hint (the kit does not read the session).
  const documentationLink = computed(() => String(session.home?.app?.documentation_link ?? ''))

  const repoUrl = ref('')
  const isPrivate = ref(false)
  const token = ref('')
  const showToken = ref(false)
  const errorMessage = ref<string | null>(null)
  const connecting = ref(false)
  const connectStatus = ref<GitConnectStatus | null>(null)

  // SSH (deploy key) state. The connect comes in the next phase.
  const sshBranch = ref('main')
  const project = ref<Record<string, unknown> | null>(null)
  const deployKey = ref<DeployKeyResult['deploy_key'] | null>(null)
  /** The user confirms the deploy key is added to the repository (gates Continue). */
  const keyAdded = ref(false)
  /** The connect of the SSH project failed; shown under the key panel, not in the error box. */
  const connectError = ref<string | null>(null)

  const normalizedRepoUrl = computed(() => repoUrl.value.trim())
  /** An SSH address (`git@host:path`, `ssh://…`) takes the deploy key branch instead of the HTTPS/PAT form. */
  const isSsh = computed(() => isSshRepoUrl(normalizedRepoUrl.value))

  /** The copy of the step the sequence is in. */
  const statusMessage = computed(() => {
    switch (connectStatus.value) {
      case 'connecting': { return t('heading.onboarding.gitDeploy.status.connecting')
      }
      case 'detectingBranches': { return t('heading.onboarding.gitDeploy.status.detectingBranches')
      }
      case 'detectingEnv': { return t('heading.onboarding.gitDeploy.status.detectingEnv')
      }
      default: { return null
      }
    }
  })

  // An SSH address needs a branch, not a token (the switch is hidden there).
  const isContinueAllowed = computed(() => (isSsh.value
    ? sshBranch.value.trim() !== ''
    : canContinue(repoUrl.value, isPrivate.value, token.value)))

  /** Counts every open and close, so a connect started in an earlier session can tell that it is stale. */
  let openSession = 0

  /** Backend 422s on the address carry the message under `errors.repo_url`. */
  function sshErrorMessage (error: unknown): string {
    const repoUrlError = (error as { response?: { data?: { errors?: { repo_url?: unknown[] } } } } | null)?.response?.data?.errors?.repo_url?.[0]
    return typeof repoUrlError === 'string' && repoUrlError !== '' ? repoUrlError : getErrorMessage(error)
  }

  /**
    * Creates the deploy key project for the SSH address. The URL field locks once it exists, the key panel
   * shows and Continue waits for the confirmation. The connect of the project follows in the next phase.
   */
  async function generateKey (): Promise<void> {
    const serviceId = props.serviceId
    if (serviceId === null) {
      return
    }
    errorMessage.value = null
    connecting.value = true
    const session = openSession
    try {
      const created = await createDeployKey({
        service_id: serviceId,
        domain_id: props.domainId,
        shared_access: [...props.sharedAccess],
        repo_url: normalizedRepoUrl.value,
      })
      // A form closed while the project was created keeps nothing (the same guard as the HTTPS connect).
      if (session !== openSession || !props.isOpen) {
        return
      }
      project.value = created.project
      deployKey.value = created.deploy_key
      emit('deploy-key-created', { project: created.project })
    } catch (error) {
      if (session === openSession) {
        errorMessage.value = sshErrorMessage(error)
      }
    } finally {
      if (session === openSession) {
        connecting.value = false
      }
    }
  }

  /**
    * Connects the created project to the repo and branch, then reads its branches and example env file.
   * A failed branch or env read is not an error (the list is empty, no example); a failed connect stays under the key panel.
   */
  async function connectSsh (): Promise<void> {
    const projectId = project.value?.id as number | string | undefined
    if (connecting.value || projectId === undefined) {
      return
    }
    connectError.value = null
    connecting.value = true
    const session = openSession
    const branch = sshBranch.value.trim()
    try {
      const connected = await connectGitSsh(projectId, { repo_url: normalizedRepoUrl.value, branch })
      let branches: string[] = []
      try {
        branches = await getGitBranchesSsh(projectId)
      } catch {
        branches = []
      }
      let preview: EnvExamplePreview = { has_example: false, variables: [] }
      try {
        preview = await getEnvExampleSsh(projectId)
      } catch {
        preview = { has_example: false, variables: [] }
      }
      if (session !== openSession || !props.isOpen) {
        return
      }
      emit('next', {
        mode: 'ssh',
        repo_url: normalizedRepoUrl.value,
        token: null,
        branch,
        branch_missing: connected.branch_missing,
        branches,
        default_branch: branch,
        preview,
      })
    } catch (error) {
      if (session === openSession) {
        connectError.value = sshErrorMessage(error)
      }
    } finally {
      if (session === openSession) {
        connecting.value = false
      }
    }
  }

  /** Cancel removes a project Generate key created and this form did not connect. */
  function cancel (): void {
    if (isSsh.value && deployKey.value) {
      emit('cancel-created-project')
      return
    }
    emit('remove-modal')
  }

  /** A blocked continue, a running connect or a parent request does nothing. */
  async function submit (): Promise<void> {
    if (!isContinueAllowed.value || props.loading || connecting.value) {
      return
    }
    if (isSsh.value) {
      // Without a project the key is created; with one, the button calls `connectSsh` instead.
      if (!project.value) {
        await generateKey()
      }
      return
    }
    errorMessage.value = null
    connecting.value = true
    const session = openSession
    try {
      const outcome = await connectGitRepo({
        testGitUrl,
        getGitBranches,
        previewEnvExample,
        translate: key => t(key),
        onStatus: status => {
          connectStatus.value = status
        },
      }, { repoUrl: repoUrl.value, isPrivate: isPrivate.value, token: token.value })
      // A form closed during the connect hands nothing on (the step guard in the flow repeats the check). A connect from an earlier
      // open of the form (closed and reopened meanwhile) is stale: it neither emits nor touches the state of the new session.
      if (session !== openSession || !props.isOpen) {
        return
      }
      if (outcome.ok) {
        emit('next', outcome.deploy)
      } else {
        errorMessage.value = outcome.message
      }
    } finally {
      if (session === openSession) {
        connecting.value = false
        connectStatus.value = null
      }
    }
  }

  // Every open and close resets the form.
  watch(() => props.isOpen, () => {
    openSession += 1
    repoUrl.value = ''
    isPrivate.value = false
    token.value = ''
    showToken.value = false
    errorMessage.value = null
    connecting.value = false
    connectStatus.value = null
    sshBranch.value = 'main'
    project.value = null
    deployKey.value = null
    keyAdded.value = false
    connectError.value = null
  })

  // Editing the url or the token, or switching the repo off private, clears the error.
  watch(isPrivate, value => {
    if (!value) {
      errorMessage.value = null
    }
  })
  watch([repoUrl, token], () => {
    errorMessage.value = null
  })
</script>

<style lang="scss" scoped>
  .form-box {
    border: 1px solid var(--v-gray-lighten4);
    border-radius: 8px;
    padding: 16px;
  }

  // V2 `.v-input` of the URL field is 50px (slot 40 + details), the V4 one 48px (`.v-input__details` net 0); the private switch row below
  // it is padded to 54px for that. Without the switch (an SSH address) the branch block carries the 2px: 16px (`mt-4`) + 2px.
  .ssh-branch {
    margin-top: 18px;
  }

  // A V2 `Checkbox` is a 48px row (`.v-input--selection-controls` margin and padding) with the box and the label centred in it.
  .key-added {
    display: flex;
    align-items: center;
    height: 48px;
  }

  .status-box {
    background-color: var(--v-gray-lighten5);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
  }

  // The outlined field stays white in both themes.
  :deep(.v-text-field .v-field--variant-outlined) {
    background-color: var(--v-white-base);
  }
</style>
