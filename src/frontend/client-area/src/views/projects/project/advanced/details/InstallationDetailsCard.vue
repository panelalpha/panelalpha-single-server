<template>
  <v-card elevation="4">
    <v-card-title class="h6 pb-6 font-weight-bold">
      {{ t('heading.instance.advanced.siteDetails.card.installation.title') }}
    </v-card-title>

    <!-- Legacy `.v-card__text` keeps 24px at the bottom; the global `_card.scss` port zeroes it (`padding-bottom: 0`), so `pb-6` restores it. -->
    <v-card-text class="pt-2 pb-6">
      <template v-if="loading">
        <v-skeleton-loader type="text@2" />
        <v-skeleton-loader type="text@2" />
        <v-skeleton-loader type="text@2" />
        <v-skeleton-loader type="text@2" />
      </template>

      <template v-else>
        <div class="details-box">
          <div class="details">
            <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.installation.directory') }}</span>

            <span class="details-value heading--text font-weight-bold">
              {{ installationDetails.directory }}
            </span>
          </div>

          <div class="d-flex flex-column p-3 details">
            <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.installation.database.name') }}</span>

            <span class="details-value heading--text font-weight-bold">
              {{ installationDetails.database_name }}
            </span>
          </div>

          <div class="d-flex flex-column p-3 details">
            <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.installation.database.user') }}</span>

            <!-- The answer carries a mask only; the login comes from the same logged reveal as the password. -->
            <span class="details-value heading--text font-weight-bold">
              <secret-value
                v-if="installationDetails.database_user"
                :instance-id="instanceId"
                secret="DB_USER"
              />

              <template v-else>
                ---
              </template>
            </span>
          </div>

          <div class="d-flex flex-column p-3 details">
            <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.installation.database.password') }}</span>

            <!-- The answer carries a mask only; the value comes from the logged reveal. -->
            <span class="details-value heading--text font-weight-bold">
              <secret-value
                v-if="installationDetails.database_password"
                :instance-id="instanceId"
                secret="DB_PASSWORD"
              />

              <template v-else>
                ---
              </template>
            </span>
          </div>

          <div class="d-flex flex-column p-3 details">
            <span class="details-label">{{ t('heading.instance.advanced.siteDetails.card.installation.database.host') }}</span>

            <span class="details-value heading--text font-weight-bold">
              {{ installationDetails.database_host }}
            </span>
          </div>

          <div
            v-for="row in redis"
            :key="row.field"
            class="d-flex flex-column p-3 details"
          >
            <span class="details-label">{{ t(REDIS_LABEL_KEYS[row.field]) }}</span>

            <span
              v-if="row.field === 'password' && row.value === null"
              class="details-value font-italic"
            >
              {{ t('general.noPassword') }}
            </span>

            <span
              v-else
              class="details-value heading--text font-weight-bold"
            >
              {{ row.value }}
            </span>
          </div>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  // The redis rows come from `redisRows`.
  import type { InstallationDetails, RedisField } from './installation-details'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import SecretValue from '@/entities/project/ui/secrets/SecretValue.vue'
  import { redisRows } from './installation-details'

  const props = defineProps<{
    instanceId: number | string
    loading: boolean
    installationDetails: Partial<InstallationDetails>
  }>()

  const { t } = useTranslation()

  const REDIS_LABEL_KEYS: Record<RedisField, string> = {
    host: 'heading.instance.advanced.siteDetails.card.installation.redis.host',
    port: 'heading.instance.advanced.siteDetails.card.installation.redis.port',
    password: 'heading.instance.advanced.siteDetails.card.installation.redis.password',
  }

  const redis = computed(() => redisRows(props.installationDetails))
</script>

<style lang="scss" scoped>
@use './details';
</style>
