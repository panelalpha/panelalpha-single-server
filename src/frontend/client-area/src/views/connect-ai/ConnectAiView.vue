<template>
  <page-frame
    testid-prefix="connect-ai"
    :title="t('heading.connectAi.title')"
  >
    <template #sidebar>
      <mcp-tool-sidebar
        :active-view="activeView"
        @select="selectView"
      />
    </template>

    <mcp-tool-panel
      v-if="isToolKey(activeView)"
      :has-active-token="store.hasActiveToken"
      :mcp-url="url"
      :tool="tools[activeView]"
      @create-token="openCreateModal"
      @go-claude-code="selectView('claudecode')"
      @go-tokens="selectView('tokens')"
    />

    <div v-else-if="activeView === 'tokens'">
      <PageTitle
        :title="t('heading.connectAi.serverUrl')"
        title-testid="connect-ai-server-url-title"
      />

      <div class="well well--gray d-flex align-center py-2 px-4">
        <mcp-code data-testid="connect-ai-url">
          {{ url }}
        </mcp-code>

        <copy-text-button
          color="gray"
          size="16"
          :text="url"
        />
      </div>

      <p class="p-3 text--gray-darken1 mt-3 mb-8">
        {{ t('heading.connectAi.serverUrlHint') }}
      </p>

      <PageTitle
        :title="t('heading.connectAi.tokens')"
        title-testid="connect-ai-tokens-title"
      >
        <template #filters>
          <PageAddButton
            data-testid="connect-ai-create-token"
            :label="t('button.connectAi.createToken')"
            @click="openCreateModal"
          />
        </template>
      </PageTitle>

      <mcp-tokens-section
        @token-delete="deleteModal?.open($event)"
        @token-revoke="revokeModal?.open($event)"
      />
    </div>

    <mcp-capabilities v-else-if="activeView === 'capabilities'" />

    <mcp-activity-log v-else-if="activeView === 'activity-log'" />

    <mcp-token-create-modal
      ref="createModal"
      @token-created="onTokenMutated"
    />

    <mcp-token-revoke-modal
      ref="revokeModal"
      @token-revoked="onTokenMutated"
    />

    <mcp-token-delete-modal
      ref="deleteModal"
      @token-deleted="onTokenMutated"
    />
  </page-frame>
</template>

<script lang="ts" setup>
  // The frame of the Connect AI screen. `activeView` is local state
  // (a reload starts on Claude Code again), the tool panels and the three manage views are switched by it.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef } from 'vue'
  import { mcpServerUrl } from '@/entities/mcp/mcp-url'
  import McpTokenCreateModal from '@/entities/mcp/ui/McpTokenCreateModal.vue'
  import CopyTextButton from '@/shared/ui/buttons/CopyTextButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import McpCode from '@/shared/ui/mcp/McpCode.vue'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { connectAiTools, isToolKey, type Translate, type ViewKey } from './connect-ai-tools'
  import { useConnectAiStore } from './connect-ai.store'
  import McpActivityLog from './McpActivityLog.vue'
  import McpCapabilities from './McpCapabilities.vue'
  import McpTokenDeleteModal from './McpTokenDeleteModal.vue'
  import McpTokenRevokeModal from './McpTokenRevokeModal.vue'
  import McpTokensSection from './McpTokensSection.vue'
  import McpToolPanel from './McpToolPanel.vue'
  import McpToolSidebar from './McpToolSidebar.vue'

  const { t } = useTranslation()
  const store = useConnectAiStore()

  const activeView = ref<ViewKey>('claudecode')

  const url = computed(() => mcpServerUrl())
  const translate: Translate = key => t(key)
  const tools = computed(() => connectAiTools(translate, url.value))

  function selectView (key: ViewKey): void {
    activeView.value = key
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const createModal = useTemplateRef('createModal')
  const revokeModal = useTemplateRef('revokeModal')
  const deleteModal = useTemplateRef('deleteModal')

  function openCreateModal (): void {
    createModal.value?.open()
  }

  // The frame's silent fetch plus the section's alerting one, when the section is mounted
  // (the tokens view). One request here, alerting only on that view.
  function onTokenMutated (): void {
    void store.fetchTokens({ alertOnError: activeView.value === 'tokens' })
  }

  onMounted(() => {
    // Silent, a failure only means "no active token".
    void store.fetchTokens()
  })
</script>

<style lang="scss" scoped src="./ConnectAiView.scss" />
