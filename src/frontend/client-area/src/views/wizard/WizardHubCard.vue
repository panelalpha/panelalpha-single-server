<template>
  <FeatureCard
    :checks="checks"
    data-testid="wizard-hub-card"
    :flag="t('setup.wizard.connect.card.flag', { defaultValue: 'Recommended' })"
    :title="t('setup.wizard.connect.card.title', { defaultValue: 'Connect with PanelAlpha Hub' })"
  >
    <template #flag-icon>
      <FeatureStarIcon />
    </template>

    <template #action>
      <AppButton
        block
        class="hub-card__button"
        data-testid="wizard-connect-button"
        :disabled="disabled"
        kind="primary"
        :loading="loading"
        size="large"
        @click="emit('connect')"
      >
        {{ label ?? t('setup.wizard.connect.card.button', { defaultValue: 'Connect with Hub' }) }}
        <WizardExternalLinkIcon class="hub-card__button-icon" />
      </AppButton>
    </template>

    <template #aside>
      <HubDiagram
        :alt="t('setup.wizard.connect.diagram.alt', { defaultValue: 'This server joins your Hub account' })"
        testid="wizard-hub-diagram"
      />
    </template>
  </FeatureCard>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import HubDiagram from '@/entities/hub/ui/HubDiagram.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import FeatureCard from '@/shared/ui/feature-card/FeatureCard.vue'
  import FeatureStarIcon from '@/shared/ui/feature-card/FeatureStarIcon.vue'
  import WizardExternalLinkIcon from './icons/WizardExternalLinkIcon.vue'

  // The card "Connect with Hub" in the frame of `FeatureCard`: the flag, the benefits and the button on the left, the diagram on the
  // right, with the large `primary` button of the admin area.
  defineProps<{
    loading?: boolean
    disabled?: boolean
    /** Text of the button once a try failed ("Start again", "Check again"); the default is "Connect with Hub". */
    label?: string
  }>()

  const emit = defineEmits<{ connect: [] }>()

  const { t } = useTranslation()

  const benefits = [
    { key: 'remote', text: 'Account stored in Hub, not on this server' },
    { key: 'login', text: 'One login for many servers' },
    { key: 'social', text: 'Sign in with GitHub or Google' },
    { key: 'go', text: 'Install verified apps from the PanelAlpha GO! catalog' },
  ]

  // A computed, so the lines follow a change of language.
  const checks = computed(() => benefits.map(benefit => t(`setup.wizard.connect.card.benefits.${benefit.key}`, { defaultValue: benefit.text })))
</script>

<style lang="scss" scoped>
  // The button is the large `primary` one of admin area ("Connect this server", 48px, 5px radius, 16/700, global `legacy/_buttons.scss`);
  // only the link icon after the label is added.
  .hub-card__button-icon {
    margin-left: 8px;
  }
</style>
