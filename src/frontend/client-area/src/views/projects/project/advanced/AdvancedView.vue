<template>
  <div>
    <v-container
      class="advanced-frame mt-6 px-0"
      :class="mobile ? 'pt-0' : ''"
    >
      <v-row
        align="stretch"
        class="mx-0 flex-lg-row flex-column"
        :class="mobile ? 'mobile-container' : ''"
        no-gutters
      >
        <!-- `advanced-pages-sidebar` sits before the content column. -->
        <slot name="sidebar">
          <AdvancedPagesSidebar :instance="instance" />
        </slot>

        <v-col
          :class="lgAndDown ? '' : 'pl-12'"
          cols="12"
          lg="10"
        >
          <router-view
            v-if="pageMounted && !redirecting"
            :instance="instance"
          />
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  // The sub-frame of the advanced pages. Only `instance` reaches the child page, as in legacy. The attributes and listeners that fall through
  // from the instance frame (`fetching`, the frame events) stay out of the DOM
  // because `inheritAttrs` is off.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { useSessionStore } from '@/shared/session/session.store'
  import { hiddenAdvancedPageOf } from './advanced-hidden-pages'
  import { hiddenInstancePageRedirect } from './advanced-instance-pages'
  import { resourceBaseFor } from './advanced-resource-base'
  import AdvancedPagesSidebar from './AdvancedPagesSidebar.vue'
  import { hiddenHostingSectionRedirect } from './hosting-context/advanced-hosting-sections'

  defineOptions({ inheritAttrs: false })

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { lgAndDown, mobile } = useDisplay()

  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()
  const singleServer = computed(() => session.home?.app?.single_server?.active === true)

  // The route watcher: a hidden page (`copy-instance`, `users`), any page the
  // sidebar does not offer (Cloudflare, Edge Cache and CDN, and every page that follows the project type, such as the
  // WordPress ones or `env-file`) and a hosting section the instance does not show go to Details. Watches the route only (not the
  // instance), as legacy does; the frame renders this view once the instance is active.
  // While the redirect is pending the child page is not mounted (legacy mounts it for a moment and its GET fails silently; here a failed GET
  // of a hidden page, e.g. 422 of `users` on a WordPress project, would show an error toast). No page, no request.
  const redirecting = ref(false)

  function redirectTo (target: string): void {
    redirecting.value = true
    void router.replace(target).finally(() => {
      redirecting.value = false
    })
  }

  watch(
    () => route.fullPath,
    () => {
      if (hiddenAdvancedPageOf(route.path) !== null) {
        redirectTo(`${resourceBaseFor(route.path)}/${String(route.params.id)}/advanced/details`)
        return
      }
      const unofferedTarget = hiddenInstancePageRedirect(route.path, String(route.params.id), props.instance, singleServer.value)
      if (unofferedTarget !== null) {
        redirectTo(unofferedTarget)
        return
      }
      const target = hiddenHostingSectionRedirect(
        route.path,
        String(route.params.id),
        typeof route.meta.advancedHostingSection === 'string' ? route.meta.advancedHostingSection : undefined,
        props.instance,
        singleServer.value,
      )
      if (target !== null) {
        redirectTo(target)
      }
    },
    { immediate: true },
  )

  const pageMounted = ref(false)

  onMounted(() => {
    pageMounted.value = true
  })
</script>

<style lang="scss" scoped>
  // V2 `.container` is 12px vertically, V4 `.v-container` 16px, and `px-0` (`!important`) keeps only the vertical part of the default.
  // The mobile `pt-0` (`!important`) still wins the top edge.
  .advanced-frame {
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .mobile-container {
    margin-left: -12px;
    margin-right: -12px;
  }
</style>
