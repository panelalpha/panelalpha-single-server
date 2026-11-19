<template>
  <nav
    aria-label="breadcrumb"
    class="fm-breadcrumb"
    data-testid="fm-breadcrumb"
  >
    <ol class="fm-breadcrumb__list">
      <li>
        <AppButton
          :aria-label="t('heading.hosting.fileManager.title')"
          class="fm-breadcrumb__item"
          icon="$home"
          kind="link"
          size="small"
          @click="open(ROOT_PATH)"
        />
      </li>

      <li
        v-for="segment in segments"
        :key="segment.path"
      >
        <v-icon
          aria-hidden="true"
          class="fm-breadcrumb__separator fm-icon-fill"
          icon="$chevronright"
          size="18"
        />

        <span
          v-if="segment.path === store.path"
          aria-current="page"
          class="fm-breadcrumb__current"
        >
          {{ segment.name }}
        </span>

        <AppButton
          v-else
          class="fm-breadcrumb__item"
          kind="link"
          size="small"
          @click="open(segment.path)"
        >
          {{ segment.name }}
        </AppButton>
      </li>
    </ol>
  </nav>
</template>

<script lang="ts" setup>
  // Clicking the folder that is already open does nothing, as in legacy.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { pathSegments, ROOT_PATH } from '@/views/hosting/file-manager/fm-path'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const segments = computed(() => pathSegments(store.path))

  function open (path: string): void {
    if (path !== store.path) {
      void store.goTo(path)
    }
  }
</script>

<style lang="scss" scoped>
.fm-breadcrumb {
  padding: 4px 0 8px;
}

// The path is home, then the folders split by chevrons; it lines up with the table below (no frame, no background, no truncation).
.fm-breadcrumb__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0 8px;
  min-height: 40px;

  li {
    display: flex;
    align-items: center;
    min-width: 0;
  }
}

.fm-breadcrumb__separator.v-icon {
  color: var(--v-gray-darken1);
}

.fm-breadcrumb__item {
  text-transform: none;
  letter-spacing: normal;
  height: auto;
  min-height: 32px;
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 20px;
  color: var(--v-gray-darken1);
}

.fm-breadcrumb__item :deep(.v-btn__content) {
  white-space: normal;
  text-align: start;
}

// The open folder is plain text, not a link.
.fm-breadcrumb__current {
  padding: 0 12px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--v-text-darken1);
  overflow-wrap: anywhere;
}
</style>
