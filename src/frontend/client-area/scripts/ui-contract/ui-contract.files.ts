// Single list of files cleaned of colour literals (change `ui-guard`, F-14; AGENTS.md "UI: tokeny i kit"). `scripts/ui-contract/ui-contract.test.ts` scans every entry.
// A slice of M-2 adds the files of its view here, one line each. `strict` also forbids inline `style=`; `allow` lists trimmed lines kept 1:1 with legacy.

export interface CleanFile {
  /** Repo-root-relative path, starting with `src/`. */
  file: string
  strict?: true
  allow?: string[]
}

export const CLEAN_FILES: ReadonlyArray<CleanFile> = [
  // Global button styles (ui-buttons-tokens): disabled/loading values come from --v-btn-* tokens
  { file: 'src/app/styles/legacy/_buttons.scss', strict: true },
  // List of instances (ui-project-list): the view, its kit (deploy logs, data iterator, selection) and avatars
  { file: 'src/views/projects/InstanceItem.vue', strict: true },
  { file: 'src/views/projects/InstanceCardImgImportPending.vue', strict: true },
  { file: 'src/views/projects/InstancesDropZone.vue', strict: true },
  { file: 'src/views/projects/InstancesView.vue', strict: true },
  { file: 'src/views/projects/InstanceActionSnackbar.vue', strict: true },
  { file: 'src/views/projects/InstanceTable.vue', strict: true },
  { file: 'src/views/projects/InstanceCardImgDeployPending.vue', strict: true },
  { file: 'src/views/projects/InstanceCardImgInstallationPending.vue', strict: true },
  { file: 'src/views/projects/ui/InstancePendingOverlay.vue', strict: true },
  { file: 'src/views/projects/ui/instance-pending.ts', strict: true },
  // Legacy `InstanceItemActions.vue:34`: the checkbox box is painted inline with `var(--v-link-base)`.
  { file: 'src/views/projects/InstanceItemActions.vue', strict: true, allow: ['style="background-color: var(--v-link-base);"'] },
  // Legacy `InstanceNoData.vue:4`: the background image is a runtime value.
  { file: 'src/views/projects/InstanceNoData.vue', strict: true, allow: [':style="{ \'background-image\': \'url(\' + backgroundImage + \')\' }"'] },
  { file: 'src/views/projects/InstanceSubinstanceIndicator.vue', strict: true },
  { file: 'src/views/projects/InstanceTableCustomSort.vue', strict: true },
  { file: 'src/views/projects/InstanceItemSkeleton.vue', strict: true },
  { file: 'src/views/projects/InstanceTableItemSkeleton.vue', strict: true },
  { file: 'src/views/projects/InstanceDeployLogsModal.vue', strict: true },
  { file: 'src/views/projects/table-items/BandwidthItem.vue', strict: true },
  { file: 'src/views/projects/table-items/CollaborateItem.vue', strict: true },
  { file: 'src/views/projects/table-items/NameItem.vue', strict: true },
  { file: 'src/views/projects/table-items/SelectItem.vue', strict: true },
  { file: 'src/views/projects/table-items/SharedItem.vue', strict: true },
  { file: 'src/views/projects/table-items/StatusItem.vue', strict: true },
  { file: 'src/views/projects/table-items/StorageItem.vue', strict: true },
  { file: 'src/views/projects/table-items/TagsItem.vue', strict: true },
  { file: 'src/views/projects/table-items/VisitorsItem.vue', strict: true },
  { file: 'src/entities/project/ui/deploy/DeployLogsConsole.vue', strict: true },
  // Inline `style=` on six elements stays (not strict)
  { file: 'src/shared/ui/selection/SelectSnackbar.vue' },
  { file: 'src/entities/project/ui/deploy/DeployLogsModal.vue', strict: true },
  { file: 'src/entities/project/ui/deploy/DeployLogsSkeleton.vue', strict: true },
  { file: 'src/entities/project/ui/deploy/DeployLogsViewer.vue', strict: true },
  { file: 'src/entities/project/ui/deploy/DeployStepsList.vue', strict: true },
  // Kit `DeploySteps` (ui-instance-source, S-132): every `.vue` of src/entities/project/ui/deploy is listed (STRICT_DIRS).
  { file: 'src/entities/project/ui/deploy/DeploySteps.vue', strict: true },
  // Skip logic of the kit `DeploySteps` (ui-instance-source): a `.ts` module, listed so the contract scans it.
  { file: 'src/entities/project/ui/deploy/deploy-skip.ts', strict: true },
  // Deploy key panel (ui-onboarding-git-deploy-key, S-130; reused by S-131): LITE deploy/DeployKeyPanel.vue, colour-free.
  { file: 'src/entities/project/ui/deploy/DeployKeyPanel.vue', strict: true },
  // Key frame of the deploy key (ui-onboarding-git-deploy-key, S-130): the box is on `--v-deploy-accent` (LITE LongValueBox.vue:113,116).
  { file: 'src/shared/ui/labels/LongValueBox.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIterator.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorFilter.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorFilterControls.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorFooter.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorFooter.scss', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorPagination.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorSearch.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/DataIteratorSortBy.vue', strict: true },
  { file: 'src/shared/ui/data-iterator/NewItemSearchCard.vue', strict: true },
  // Legacy `dataIterator/tables/TableFullScreenMessage.vue:6`: the content width is a prop.
  { file: 'src/shared/ui/data-iterator/TableFullScreenMessage.vue', strict: true, allow: [':style="`max-width: ${maxWidth};`"'] },
  { file: 'src/entities/project/ui/InstanceAvatar.vue', strict: true },
  { file: 'src/entities/project/ui/InstanceAvatarImgError.vue', strict: true },
  // Project limits modal (feat/services-limits): moved here from `views/projects/project/advanced/details`, shared by Details and My plans.
  { file: 'src/entities/project/ui/ProjectLimitsModal.vue', strict: true },
  // Session and setup screens, auth frame (auth-pages, free-setup-wizard)
  { file: 'src/views/auth/AcceptInviteView.vue', strict: true },
  { file: 'src/views/auth/ForgotPasswordView.vue', strict: true },
  { file: 'src/views/auth/HubLoginView.vue', strict: true },
  { file: 'src/views/auth/LoginView.vue', strict: true },
  { file: 'src/views/auth/RegisterView.vue', strict: true },
  { file: 'src/views/auth/RegistrationTermsModal.vue', strict: true },
  { file: 'src/views/auth/ResetPasswordView.vue', strict: true },
  { file: 'src/views/auth/SocialLoginView.vue', strict: true },
  { file: 'src/views/auth/SsoLoginView.vue', strict: true },
  // SSO login (ui-sso-login, S-81): the logic modules of the view, next to `login/*.ts`.
  { file: 'src/views/auth/sso/sso-login-flow.ts', strict: true },
  { file: 'src/views/auth/sso/sso-login-redirect.ts', strict: true },
  { file: 'src/shared/session/style-manager-flag.ts', strict: true },
  // Hub login (ui-hub-login, S-75): the logic modules of `HubLoginView.vue` (ticket exchange, start of the button), next to `sso/*.ts`.
  { file: 'src/shared/session/hub-login-exchange.ts', strict: true },
  { file: 'src/views/auth/hub/hub-login-start.ts', strict: true },
  // Accept invite (ui-accept-invite, S-82): the logic module of the view, next to the `sso/*.ts` modules.
  { file: 'src/views/auth/accept-invite/accept-invite-flow.ts', strict: true },
  // Legacy `VerifyEmail.vue:93`: the countdown label is painted inline with `var(--v-gray-lighten2)`.
  { file: 'src/views/auth/VerifyEmail.vue', strict: true, allow: [':style="resendWait ? resendWaitLabelStyle : undefined"'] },
  // Wizard of the first run (ui-admin-wizard, S-135): admin area icons as SVG components (`currentColor`, no colour literals) and the pure modules.
  { file: 'src/views/wizard/WizardFooter.vue', strict: true },
  { file: 'src/views/wizard/WizardLockedHint.vue', strict: true },
  { file: 'src/views/wizard/WizardPasswordChecker.vue', strict: true },
  { file: 'src/views/wizard/WizardPasswordField.vue', strict: true },
  { file: 'src/views/wizard/WizardTextField.vue', strict: true },
  { file: 'src/views/wizard/steps/ConnectAiStep.vue', strict: true },
  { file: 'src/views/wizard/steps/GeneralConfigStep.vue', strict: true },
  { file: 'src/views/wizard/steps/PanelAlphaConnectStep.vue', strict: true },
  { file: 'src/views/wizard/steps/SummaryStep.vue', strict: true },
  { file: 'src/views/wizard/WizardAiPanel.vue', strict: true },
  { file: 'src/views/wizard/WizardConfetti.vue', strict: true },
  { file: 'src/views/wizard/WizardHubAccount.vue', strict: true },
  { file: 'src/views/wizard/WizardHubCard.vue', strict: true },
  { file: 'src/shared/ui/feature-card/FeatureCard.vue', strict: true },
  { file: 'src/shared/ui/feature-card/FeatureCheckIcon.vue', strict: true },
  { file: 'src/shared/ui/feature-card/FeatureCheckList.vue', strict: true },
  { file: 'src/shared/ui/feature-card/FeatureFlag.vue', strict: true },
  { file: 'src/shared/ui/feature-card/FeatureStarIcon.vue', strict: true },
  { file: 'src/entities/hub/ui/HubDiagram.vue', strict: true },
  { file: 'src/views/wizard/WizardLanguage.vue', strict: true },
  { file: 'src/views/wizard/WizardLayout.vue', strict: true },
  { file: 'src/views/wizard/WizardSidebar.vue', strict: true },
  { file: 'src/views/wizard/WizardStartPage.vue', strict: true },
  { file: 'src/views/wizard/WizardStepFrame.vue', strict: true },
  { file: 'src/views/wizard/WizardView.vue', strict: true },
  { file: 'src/shared/ui/icons/server.vue', strict: true },
  { file: 'src/views/wizard/icons/WizardArrowRightIcon.vue', strict: true },
  { file: 'src/views/wizard/icons/WizardBenefitIcon.vue', strict: true },
  { file: 'src/views/wizard/icons/WizardCloseIcon.vue', strict: true },
  { file: 'src/views/wizard/icons/WizardEyeClosedIcon.vue', strict: true },
  { file: 'src/views/wizard/icons/WizardEyeIcon.vue', strict: true },
  { file: 'src/views/wizard/icons/WizardExternalLinkIcon.vue', strict: true },
  { file: 'src/shared/ui/auth-frame/auth-screen.scss', strict: true },
  { file: 'src/shared/ui/auth-frame/AuthFrame.vue', strict: true },
  // Shared social block of Login and Register (ui-register, Charge E)
  { file: 'src/shared/ui/auth-frame/AuthSocialButtons.vue', strict: true },
  // Register and VerifyEmail banner (ui-register, Charge B)
  { file: 'src/shared/ui/auth-message/AuthMessage.vue', strict: true },
  // Session card, support sentence and recovery code (kit-auth-card, K-21, KC-20)
  { file: 'src/shared/ui/auth-frame/AuthCard.vue', strict: true },
  { file: 'src/shared/ui/auth-frame/RecoveryCodeBox.vue', strict: true },
  { file: 'src/shared/ui/auth-frame/SupportLink.vue', strict: true },
  // Login and social callback (ui-login, S-79): the logic modules of the views. The `!important` of `auth-screen.scss` and
  // `VerifyEmail.vue` (Charge A, deferred) is counted by `ui:scan` only, so those files stay listed as they are.
  { file: 'src/views/auth/login/accept-invite.ts', strict: true },
  { file: 'src/shared/session/demo-mode.ts', strict: true },
  { file: 'src/views/auth/login/four-digit-code.ts', strict: true },
  { file: 'src/views/auth/login/login-entry.ts', strict: true },
  { file: 'src/views/auth/login/login-errors.ts', strict: true },
  { file: 'src/shared/session/login-redirect.ts', strict: true },
  { file: 'src/views/auth/login/login-steps.ts', strict: true },
  { file: 'src/views/auth/login/recaptcha.ts', strict: true },
  { file: 'src/views/auth/login/social-callback-flow.ts', strict: true },
  { file: 'src/shared/session/social-callback-path.ts', strict: true },
  { file: 'src/views/auth/login/social-callback-redirect.ts', strict: true },
  { file: 'src/views/auth/login/social-callback-state.ts', strict: true },
  { file: 'src/views/auth/login/verify-email-outcome.ts', strict: true },
  // Register entry and quick-register query steps (ui-register, Charges C-D): logic modules, no colours
  { file: 'src/views/auth/login/register-entry.ts', strict: true },
  { file: 'src/views/auth/login/register-quick.ts', strict: true },
  // Free panel: hub, settings, tasks and the shared kit they use (free-settings, free-tasks)
  { file: 'src/views/account/settings/hub/HubConnection.vue', strict: true },
  { file: 'src/views/account/settings/hub/HubDisconnectModal.vue', strict: true },
  { file: 'src/views/account/settings/SettingsView.vue', strict: true },
  { file: 'src/views/account/settings/backups/BackupSettings.vue', strict: true },
  { file: 'src/views/account/settings/backups/BackupStorage.vue', strict: true },
  { file: 'src/views/account/settings/backups/BackupStoreModal.vue', strict: true },
  { file: 'src/views/account/settings/backups/BackupStoreRemoveModal.vue', strict: true },
  { file: 'src/views/account/tasks/TaskDetails.vue', strict: true },
  { file: 'src/views/account/tasks/TaskProjectCell.vue', strict: true },
  { file: 'src/views/account/tasks/TaskStatusLabel.vue', strict: true },
  { file: 'src/views/account/tasks/TasksTableCell.vue', strict: true },
  { file: 'src/views/account/tasks/TasksView.vue', strict: true },
  { file: 'src/shared/ui/settings-section/SettingsSection.vue', strict: true },
  { file: 'src/shared/ui/error-card/ErrorCard.vue', strict: true },
  // Error page of the standalone screens (ui-sso-login, S-81): the only primitive of the view is its shell.
  { file: 'src/shared/ui/error-page/ErrorPage.vue', strict: true },
  // Signed-in shell (ui-shell)
  { file: 'src/app/App.vue', strict: true },
  { file: 'src/app/shell/AppFooter.vue', strict: true },
  { file: 'src/app/shell/NewInstanceFloatingButton.vue', strict: true },
  { file: 'src/app/shell/navbar/AddNewInstanceButton.vue', strict: true },
  { file: 'src/app/shell/navbar/AdminAreaDropdown.vue', strict: true },
  { file: 'src/app/shell/navbar/AppNavbar.vue', strict: true },
  { file: 'src/app/shell/navbar/NavbarTopNavigation.vue', strict: true },
  { file: 'src/app/shell/navbar/UserInfoDropdown.vue', strict: true },
  { file: 'src/app/shell/navbar/NavbarTopNavigation.scss', strict: true },
  { file: 'src/app/shell/notifications/NotificationsDropdown.vue', strict: true },
  { file: 'src/app/shell/notifications/NotificationsManager.vue', strict: true },
  { file: 'src/app/shell/notifications/NotificationsManagerEmpty.vue', strict: true },
  { file: 'src/app/shell/trial/TrialExpiredModal.vue', strict: true },
  { file: 'src/app/shell/trial/TrialInfoBox.vue', strict: true },
  { file: 'src/shared/ui/alerts/AlertManager.vue', strict: true },
  { file: 'src/shared/ui/alerts/AlertSm.vue', strict: true },
  { file: 'src/shared/ui/alerts/ErrorAlert.vue', strict: true },
  { file: 'src/shared/ui/alerts/SuccessAlert.vue', strict: true },
  // Alert surfaces (ui-forgot-password, S-83): success and error tones come from `--v-alert-*` tokens (Charge A). The 15 lines
  // below are info/warning tones, `.alert-header` and `.login-message`, which other screens measure; kept 1:1 with `_alert.scss`
  // until those slices move them (deferred, `ui-forgot-password` change notes).
  {
    file: 'src/app/styles/legacy/_alert.scss',
    strict: true,
    allow: [
      'background: rgba(0, 94, 234, 0.08);', // _alert.scss:109 (`--info-bg`)
      'background: rgba(231, 29, 29, 0.05);', // _alert.scss:122 (`--error-bg`, other screens)
      'rgba(241, 40, 40, 0.06) 0%,', // _alert.scss:141 (`--warning` gradient)
      'rgba(241, 40, 40, 0) 33.43%', // _alert.scss:142
      'color: #FF5C00;', // _alert.scss:167 (`.alert-header` warning)
      'background: #FF7A2F26;', // _alert.scss:168
      'color: #E71D1D;', // _alert.scss:171 (`.alert-header` danger)
      'background: #E71D1D26;', // _alert.scss:172
      'rgba(241, 40, 40, 0.06) 0%,', // _alert.scss:227 (`.login-message--error`)
      'rgba(241, 40, 40, 0) 33.43%', // _alert.scss:228
      'border: 1px solid rgba(231, 29, 29, 0.15);', // _alert.scss:230
      'background: linear-gradient(90deg, rgba(7, 192, 126, 0.06) 0%, rgba(3, 90, 59, 0) 60.43%);', // _alert.scss:236 (`.login-message--success`)
      'border: 1px solid rgba(10, 170, 113, 0.2);', // _alert.scss:237
      'background: linear-gradient(90deg, rgba(255, 122, 47, 0.06) 0%, rgba(153, 73, 28, 0) 60.43%);', // _alert.scss:243 (`.login-message--warning`)
      'border: 1px solid rgba(255, 122, 47, 0.15);', // _alert.scss:244
    ],
  },
  { file: 'src/views/auth/login/forgot-password-entry.ts', strict: true },
  { file: 'src/views/auth/login/forgot-password-outcome.ts', strict: true },
  // Reset password (ui-reset-password, S-84): the logic modules of the view
  { file: 'src/views/auth/login/reset-password-flow.ts', strict: true },
  { file: 'src/views/auth/login/reset-password-outcome.ts', strict: true },
  // Page not found (ui-page-not-found, S-85): the view and the logo and illustration of its card. The `!important` on the
  // `.error-text` font-size (`PageNotFoundView.vue:141`) is 1:1 with legacy `PageNotFound.vue` (lite) and is not failed by the gate.
  { file: 'src/views/not-found/PageNotFoundView.vue', strict: true },
  { file: 'src/shared/ui/logo/BrandLogo.vue', strict: true },
  { file: 'src/shared/ui/illustrations/DataIteratorNoResultIllustration.vue', strict: true },
  { file: 'src/shared/ui/language/LanguageSwitcher.vue', strict: true },
  { file: 'src/shared/ui/user-avatar/UserAvatar.vue', strict: true },
  // Project frame and General page (ui-instance-general): `!important` kept only where the scan note explains it
  { file: 'src/views/projects/project/InstanceView.vue', strict: true },
  { file: 'src/views/projects/project/general/GeneralView.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/GeneralCardSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/FilesSourceInfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/GitSourceInfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/InstallationInfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/InstanceAnalyticsCardSystem.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/InstanceAnalyticsCardVisitors.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/LoadingSpeedIllustration.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/LoadingSpeedInfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/SecurityInfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/cards/SiteDetailsInfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/modals/FilesUploadVersionModal.vue', strict: true },
  { file: 'src/views/projects/project/general/modals/GitRedeployModal.vue', strict: true },
  { file: 'src/views/projects/project/topbar/InstanceSearchItem.vue', strict: true },
  { file: 'src/views/projects/project/topbar/InstanceSearchItemSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/topbar/InstanceStatusTabAlert.vue', strict: true },
  { file: 'src/views/projects/project/topbar/InstanceTopBar.vue', strict: true },
  { file: 'src/views/projects/project/topbar/InstanceTopBarTabs.vue', strict: true },
  { file: 'src/views/projects/project/topbar/InstanceTopBarTabsSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/topbar/ReportProviderTrackingCodeModal.vue', strict: true },
  { file: 'src/views/projects/project/topbar/TopBarEditableTitle.vue', strict: true },
  { file: 'src/views/projects/project/topbar/TopBarSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/topbar/TopBarSubinstanceBar.vue', strict: true },
  { file: 'src/views/projects/project/topbar/TopBarTitle.vue', strict: true },
  { file: 'src/entities/ssl/ui/PendingSslIndicator.vue', strict: true },
  { file: 'src/entities/ssl/ui/PendingSslTooltip.vue', strict: true },
  { file: 'src/entities/ssl/ui/SslEditModal.vue', strict: true },
  { file: 'src/entities/ssl/ui/SslIndicator.vue', strict: true },
  // Onboarding choice steps (ui-onboarding-choice, S-72): the nine modals of the choice path, the template modal's cards and
  // skeletons, the shared `CheckboxBig` and the step indicator. Import, install and deploy modals are S-73 (not listed here).
  // Inline styles below are kept 1:1 with LITE (`plik:linia` legacy): `OnboardingChooseTemplateModal.vue:75,98,180`,
  // `OnboardingShareAccessModal.vue:207`, `TagsSidebar.vue:9`.
  { file: 'src/views/onboarding/modals/OnboardingZeroDataModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingNoInstallationTypeModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseInstallationTypeModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseCreationTypeModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseServiceModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingLimitModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseTemplateModal.vue', strict: true, allow: ['style="position: relative"', 'style="max-width: 300px !important"', 'style="height: 92px; width: 100%"'] },
  { file: 'src/views/onboarding/modals/OnboardingShareAccessModal.vue', strict: true, allow: ['style="width: 280px"'] },
  { file: 'src/views/onboarding/modals/OnboardingChooseUserConfigurableOptionsModal.vue', strict: true },
  // Onboarding install, import and deploy modals (ui-onboarding-install, S-73): colour-free, `!important` only on the padding and
  // background rules of the V2 reset (scan notes in `vuetify2-to-4-mapping.md`, section ui-onboarding-install).
  { file: 'src/views/onboarding/modals/OnboardingChooseDomainModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseImportMethodModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseOnboardingProcessModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingChooseSiteNameModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingDeployFromGitModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingDeployFromZipModal.vue', strict: true },
  // "Deploy with Go!": the full-page PanelAlpha Go catalog, its cards and an app's details; theme tokens only.
  { file: 'src/views/onboarding/modals/OnboardingGoCatalogModal.vue', strict: true },
  { file: 'src/views/onboarding/go/GoAppCard.vue', strict: true },
  { file: 'src/views/onboarding/go/GoAppDetailsView.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingDeployLogsHost.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingDomainInstantVerificationModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingDomainTransferModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingEnvVarsModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingImportAdvancedMethodModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingImportInstanceSetupCompleteModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingImportSimpleMethodModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingImportUrlModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingInstallationInProgressModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingStandardFormModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingStandardFormSubdirectory.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingSuperQuickInstallationProgressModal.vue', strict: true },
  { file: 'src/views/onboarding/modals/OnboardingSyncInstancesProgressModal.vue', strict: true },
  // Onboarding git deploy key (ui-onboarding-git-deploy-key, S-130): the wrapper that mounts the modals and the SSH launch flow; colour-free and no inline `style=`.
  { file: 'src/views/onboarding/OnboardingModalWrapper.vue', strict: true },
  // perf-onboarding-lazy: the 26 modals moved from the wrapper to one lazy chunk, same colour-free contract.
  { file: 'src/views/onboarding/OnboardingModals.vue', strict: true },
  { file: 'src/views/onboarding/git-ssh-launch.ts', strict: true },
  // Progress card kit (ui-onboarding-install, Phase 5): the box, its gradients and the bar tone come from `--v-progress-*` tokens.
  { file: 'src/shared/ui/progress-card/ProgressCard.vue', strict: true },
  { file: 'src/shared/ui/loader/DotLoader.vue', strict: true },
  // Shared usage stat card (usage-redesign): the Usage page and the Project details cards.
  { file: 'src/shared/ui/usage-stat/UsageStatCard.vue', strict: true },
  { file: 'src/views/onboarding/template/TagsSidebar.vue', strict: true, allow: ['style="height: 100%"'] },
  { file: 'src/views/onboarding/template/TagsSidebarSkeleton.vue', strict: true },
  { file: 'src/views/onboarding/template/TemplateCard.vue', strict: true },
  { file: 'src/views/onboarding/template/TemplateCardSkeleton.vue', strict: true },
  { file: 'src/shared/ui/buttons/CheckboxBig.vue', strict: true },
  { file: 'src/shared/ui/step-indicator/StepIndicator.vue', strict: true },
  // Mobile table card kit (kit-mobile-table-field, K-04): the field and the frame of a card, no styles of their own.
  { file: 'src/shared/ui/data-table/MobileTableCard.vue', strict: true },
  { file: 'src/shared/ui/data-table/MobileTableField.vue', strict: true },
  // The one table of the app (kit-data-table, K-06, KC-01): the frame, its logic and the alias of the old HostingTable.
  { file: 'src/shared/ui/data-table/DataTable.vue', strict: true },
  { file: 'src/shared/ui/data-table/data-table.ts', strict: true },
  { file: 'src/shared/ui/data-table/HostingTable.vue', strict: true },
  // Project list actions (ui-project-list-actions, S-70): menu, action modals, labels, share, DNS/SSL, preview. `!important` kept 1:1 only where the scan note explains it.
  // Not listed: `status-issues/StatusIndicator.vue:337` reads `var(--v-heading-base)`, undefined in legacy too (falls back to the inherited colour); a token would change the render, left for the slice that owns StatusIndicator.
  // Dialog width is a runtime value of the action modal registry.
  { file: 'src/entities/project/ui/ActionModalHost.vue', strict: true, allow: [':style="{ width }"'] },
  { file: 'src/entities/project/ui/AppSsoModal.vue', strict: true },
  { file: 'src/entities/project/ui/CancelInstallationDialog.vue', strict: true },
  { file: 'src/entities/project/ui/CreateStagingModal.vue', strict: true },
  { file: 'src/entities/project/ui/DnsSslIndicator.vue', strict: true },
  { file: 'src/entities/project/ui/ImportInstanceDetailsModal.vue', strict: true },
  // Legacy `InstanceAvatarImgNotAvailable.vue`: white tile behind the placeholder image, kept 1:1.
  { file: 'src/entities/project/ui/InstanceAvatarImgNotAvailable.vue', strict: true, allow: ['background: #fff;'] },
  { file: 'src/entities/project/ui/InstanceCardImgNotAvailable.vue', strict: true },
  { file: 'src/entities/project/ui/PreviewErrorIconSm.vue', strict: true },
  // Illustration: the SVG fill is the artwork itself (legacy `PreviewNotAvailableIcon.vue`).
  { file: 'src/entities/project/ui/PreviewNotAvailableIcon.vue', strict: true, allow: ['fill="#07C07E"'] },
  { file: 'src/entities/project/ui/PreviewNotAvailableIconSm.vue', strict: true },
  { file: 'src/entities/project/ui/PreviewSiteModal.vue', strict: true },
  { file: 'src/entities/project/ui/ShareAccessTable.vue', strict: true },
  { file: 'src/entities/project/ui/ShareCustomPrivileges.vue', strict: true },
  { file: 'src/entities/project/ui/ShareInstanceModal.vue', strict: true },
  { file: 'src/entities/project/ui/ShareInviteForm.vue', strict: true },
  { file: 'src/entities/project/ui/ShareLoginAsSelect.vue', strict: true },
  { file: 'src/entities/project/ui/SharePersonCell.vue', strict: true },
  { file: 'src/entities/project/ui/ShareRoleSelect.vue', strict: true },
  { file: 'src/entities/project/ui/SharesLabel.vue', strict: true },
  { file: 'src/entities/project/ui/SharesLabelBig.vue', strict: true },
  { file: 'src/entities/project/ui/WpAdminSsoModal.vue', strict: true },
  { file: 'src/entities/label/ui/AddNewLabel.vue', strict: true },
  { file: 'src/entities/label/ui/AssignExistingLabel.vue', strict: true },
  { file: 'src/entities/label/ui/InstanceLabels.vue', strict: true },
  // Label colour is user data, not a UI colour.
  { file: 'src/shared/ui/labels/LabelChip.vue', strict: true, allow: [':style="item.color ? { borderColor: item.color } : undefined"'] },
  // Label colour is user data, not a UI colour.
  { file: 'src/shared/ui/labels/LabelSimple.vue', strict: true, allow: [':style="{ color: item.color }"'] },
  // Label colour is user data, not a UI colour.
  { file: 'src/entities/label/ui/LabelsList.vue', strict: true, allow: [':style="`color:${item.color};`"', ':style="`background-color:${item.color};`"'] },
  // Role colours come from the role definition (runtime props), not from a literal.
  { file: 'src/shared/ui/labels/UserRoleLabel.vue', strict: true, allow: [':style="{ backgroundColor: background, borderColor: background }"', ':style="{ color: text }"'] },
  { file: 'src/entities/project/ui/status-issues/IssueResolveModal.vue', strict: true },
  { file: 'src/entities/project/ui/status-issues/UploadArchiveWidget.vue', strict: true },
  { file: 'src/entities/domain/ui/DnsOptions.vue', strict: true },
  { file: 'src/entities/domain/ui/DomainsNameserverChecker.vue', strict: true },
  { file: 'src/entities/domain/ui/TransferDomainSteps.vue', strict: true },
  { file: 'src/shared/ui/modal/BasicModal.scss', strict: true },
  { file: 'src/shared/ui/modal/BasicModal.vue', strict: true },
  // Textarea height is a runtime field option.
  { file: 'src/shared/ui/modal/BasicModalField.vue', strict: true, allow: [':style="field.height === undefined ? undefined : { \'--modal-textarea-height\': toCssSize(field.height) }"'] },
  { file: 'src/shared/ui/modal/ModalCloseButton.vue', strict: true },
  // Wzorzec przycisków (kit-button, K-01): the component, its `kind` mapping and the copy preset (`ModalCloseButton` and `QuickActionsButton` are listed elsewhere).
  { file: 'src/shared/ui/buttons/AppButton.vue', strict: true },
  { file: 'src/shared/ui/buttons/app-button.ts', strict: true },
  { file: 'src/shared/ui/buttons/CopyTextButton.vue', strict: true },
  // Przełącznik widoku na `AppButton kind="icon-toggle"` (kit-button-icon, K-03).
  { file: 'src/shared/ui/buttons/ListGridSwitch.vue', strict: true },
  // Wzorzec dialogu (kit-dialog, K-02): the shell of the kit dialog family (no style, no colour; the presets keep their card and styles).
  { file: 'src/shared/ui/modal/AppDialog.vue', strict: true },
  // Wzorzec modala (kit-dialog, K-02): the builder types and the composable of the `form` preset (`ActionModalHost`, `McpTokenModal` are listed elsewhere).
  { file: 'src/shared/ui/modal/action-modal.ts', strict: true },
  { file: 'src/shared/ui/modal/use-action-modal.ts', strict: true },
  { file: 'src/views/projects/InstanceItemMenu.vue', strict: true },
  { file: 'src/views/projects/PreviewSiteButton.vue', strict: true },
  { file: 'src/views/projects/CollaborateLabel.vue', strict: true },
  { file: 'src/entities/project/instance-row-actions.ts', strict: true },
  // Data, not UI colours: the label palette of legacy `labelMenu.js`.
  { file: 'src/entities/label/label-menu.ts', strict: true, allow: ['\'#EB6464\',', '\'#EB64AD\',', '\'#EB64D5\',', '\'#D064EB\',', '\'#9F64EB\',', '\'#6764EB\',', '\'#448ED6\',', '\'#44B3D6\',', '\'#44CDD6\',', '\'#44D6BB\',', '\'#44D690\',', '\'#51CC56\',', '\'#07C07E\',', '\'#91D23E\',', '\'#C9BC44\',', '\'#C5944B\',', '\'#EE8F49\',', '\'#D72E23\','] },
  // Data, not UI colours: HTML of the tooltip, its styles are built at runtime.
  { file: 'src/entities/project/target-item-box.ts', strict: true, allow: ['return `<span class="target-item-box" style="${boxStyle(border, flat)}"><span class="${NAME_CLASS}">${labelHtml}</span>${extraHtml}</span>`', '.map((label, index) => `<span class="${NAME_CLASS}" style="display: flex${index < labelsHtml.length - 1 ? \'; margin-bottom: 12px\' : \'\'}">${label}</span>`)', 'return `<span class="target-item-box flex-column" style="${boxStyle(border, flat)}; flex-direction: column; align-items: stretch">${rows}</span>`'] },
  // Data, not UI colours: ApexCharts axis and grid colours of legacy.
  { file: 'src/entities/project/instance-analytics.ts', strict: true, allow: ['colors: \'#797997\',', 'grid: { borderColor: \'#DEDEF1\', strokeDashArray: 9 },'] },
  // Instance → Backups (ui-instance-backups, S-86): the view, its kit and the selection snackbar.
  { file: 'src/views/projects/project/backups/BackupsSelectSnackbar.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsTable.scss', strict: true },
  { file: 'src/views/projects/project/backups/BackupsTable.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsTableItemSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsTableItemSkeletonMobile.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsTableResponsiveItem.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsTableSortSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsMobileFields.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupDataCheck.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsUsageItem.vue', strict: true },
  { file: 'src/views/projects/project/backups/BackupsView.vue', strict: true },
  { file: 'src/entities/project/ui/backups/AutomaticBackupsConfirmation.vue', strict: true },
  { file: 'src/entities/project/ui/backups/AutomaticBackupsModal.vue', strict: true },
  { file: 'src/entities/project/ui/backups/BackupAutomaticSwitcher.vue', strict: true },
  { file: 'src/entities/project/ui/backups/BackupStoreMissingNotice.vue', strict: true },
  { file: 'src/entities/project/ui/backups/CreateBackupModal.vue', strict: true },
  { file: 'src/entities/project/ui/backups/TimePicker.vue', strict: true },
  // Monitoring page (ui-instance-monitoring, S-87): the view, its cards and charts, the data helpers and the kit they use.
  // `!important` is not failed by the gate; the kept ones carry their reason in the file (MonitoringChart.vue:36-41, SharesCardSkeleton.vue:93-99).
  { file: 'src/views/projects/project/monitoring/MonitoringView.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/monitoring.ts', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/DoughnutChartCard.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/MonitoringValueIndicator.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/MonitoringVisitorsCard.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/PieChartCard.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/PieChartSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/SharesCard.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/SharesCardSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/cards/_chart-list.scss', strict: true },
  { file: 'src/views/projects/project/monitoring/charts/DoughnutChart.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/charts/MonitoringChart.vue', strict: true },
  { file: 'src/views/projects/project/monitoring/charts/PieChart.vue', strict: true },
  { file: 'src/shared/ui/charts/ApexChart.vue', strict: true },
  { file: 'src/shared/ui/charts/ProgressSpeedChart.vue', strict: true },
  { file: 'src/shared/ui/charts/ProgressChart.vue', strict: true },
  { file: 'src/shared/ui/charts/chart-colors.ts', strict: true },
  // Hosting usage page (ui-hosting-usage, S-113): the view and the frame (`views/hosting`, not in STRICT_DIRS, other hosting pages
  // are S-105..S-117), the usage cards and charts, and the one sidebar scoped by the three screens. `!important` is counted by
  // `ui:scan` only (ActiveHostingPlanSelector.vue, NoAvailableHostingView.vue, UsageCard.vue, PagesSidebar.vue).
  { file: 'src/views/hosting/HostingView.vue', strict: true },
  { file: 'src/views/hosting/HostingPagesSidebar.vue', strict: true },
  { file: 'src/views/hosting/ActiveHostingPlanSelector.vue', strict: true },
  { file: 'src/views/hosting/NoAvailableHostingView.vue', strict: true },
  { file: 'src/views/hosting/hosting-screen.scss', strict: true },
  { file: 'src/views/hosting/hosting-title-row.scss', strict: true },
  { file: 'src/views/hosting/usage/UsageView.vue', strict: true },
  { file: 'src/views/hosting/usage/UsageCard.vue', strict: true },
  { file: 'src/views/hosting/usage/GraphsCard.vue', strict: true },
  { file: 'src/views/hosting/usage/MetricsGraph.vue', strict: true },
  { file: 'src/views/hosting/usage/metrics-graphs.ts', strict: true },
  { file: 'src/views/hosting/usage/GraphsChartSkeleton.vue', strict: true },
  { file: 'src/shared/ui/sidebar/PagesSidebar.vue', strict: true },
  { file: 'src/shared/ui/sidebar/pages-sidebar.ts', strict: true },
  // Summary page (ui-hosting-summary, S-114): the view, its cards and the skeleton (every `.vue` of `src/views/hosting/summary` is listed).
  // `!important` lines (HostingSummaryCard.vue, HostingInstancesCard.vue) are counted by `ui:scan` only, 1:1 with legacy. The grey of the space
  // tile without a limit is the chart track token, so `plan-usage.ts` has no literal.
  { file: 'src/views/hosting/summary/SummaryView.vue', strict: true },
  { file: 'src/views/hosting/summary/HostingSummaryCard.vue', strict: true },
  { file: 'src/views/hosting/summary/HostingSummaryCardSkeleton.vue', strict: true },
  { file: 'src/views/hosting/summary/HostingAvailableSpaceCard.vue', strict: true },
  { file: 'src/views/hosting/summary/HostingNameserversCard.vue', strict: true },
  { file: 'src/views/hosting/summary/HostingInstancesCard.vue', strict: true },
  { file: 'src/views/hosting/summary/skeleton.scss', strict: true },
  { file: 'src/views/hosting/summary/plan-usage.ts', strict: true },
  // Advanced frame and Details page (change `ui-instance-advanced-frame`, S-89): the view, its sidebar and the sidebar kit copy.
  // No `allow` lines: the files carry no colour literal and no inline style. Their `!important` lines are annotated in the files.
  { file: 'src/views/projects/project/advanced/AdvancedView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/AdvancedPagesSidebar.vue', strict: true },
  { file: 'src/views/projects/project/advanced/AdvancedPagesSidebar.scss' },
  { file: 'src/views/projects/project/advanced/advanced-sidebar-items.ts' },
  // Details page (`details/*`, every `.vue` below is listed, see STRICT_DIRS)
  { file: 'src/views/projects/project/advanced/details/DetailsView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/details/EditableHeader.vue', strict: true },
  { file: 'src/views/projects/project/advanced/details/InstallationDetailsCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/details/ProjectUsageCards.vue', strict: true },
  { file: 'src/views/projects/project/advanced/details/SiteDetailsCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/details/_details.scss' },
  { file: 'src/views/projects/project/advanced/details/installation-details.ts' },
  { file: 'src/views/projects/project/advanced/details/site-details.ts' },
  // Env file page (ui-instance-env-vars, S-129): the view, its table, the line model (`env-vars.ts`, port of legacy `EnvFileUtil.js`), the modal
  // definitions and the API module. The editor modules were removed in phase 5. No `allow`: no colour literal and no inline `style=` (`ui:scan` = 0).
  { file: 'src/views/projects/project/advanced/env-file/EnvFileView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/env-file/EnvVarsTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/env-file/env-vars.ts', strict: true },
  { file: 'src/views/projects/project/advanced/env-file/env-vars-modals.ts', strict: true },
  { file: 'src/views/projects/project/advanced/env-file/env-file.api.ts', strict: true },
  // Security page (change `ui-instance-security`, S-94): the view, its three cards and the settings and API modules; the skeleton of the
  // kit (`AutoUpdatesCardSkeleton`, shared with Auto-updates). Every `.vue` of the directory is listed (see STRICT_DIRS).
  { file: 'src/views/projects/project/advanced/security/SecurityView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/security/SslCertificateCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/security/ForceHttpsCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/security/SearchEngineIndexingCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/security/security-settings.ts' },
  { file: 'src/views/projects/project/advanced/security/security.api.ts' },
  { file: 'src/shared/ui/skeletons/AutoUpdatesCardSkeleton.vue', strict: true },
  // Copy Instance page (ui-instance-copy, S-104): the modal width is a scoped class (legacy `CopyInstance.vue:59` inline `width: 560px`).
  { file: 'src/views/projects/project/advanced/copy-instance/CopyInstanceView.vue', strict: true },
  // Git page (ui-instance-git, S-102): the view, the skeleton, the log table, its logic modules and the doc hint of the kit. No colour literal;
  // since K-07 the log table is the kit `DataTable` and has no `!important`.
  { file: 'src/views/projects/project/advanced/git/GitView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/git/GitCardSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/advanced/git/GitLogsTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/git/git-actions.ts', strict: true },
  { file: 'src/views/projects/project/advanced/git/git-status.ts', strict: true },
  { file: 'src/views/projects/project/advanced/git/git.api.ts', strict: true },
  { file: 'src/views/projects/project/advanced/git/use-git-page.ts', strict: true },
  // Deploy key on the Git page (ui-instance-git-deploy-key, S-131): key logic, its composable and the SSH URL helper; colour-free, no `allow`.
  { file: 'src/views/projects/project/advanced/git/git-deploy-key.ts', strict: true },
  { file: 'src/views/projects/project/advanced/git/use-git-deploy-key.ts', strict: true },
  { file: 'src/entities/project/git-ssh-url.ts', strict: true },
  { file: 'src/shared/ui/form/FormFieldDocHint.vue', strict: true },
  // Plugins page (ui-instance-plugins, S-88): the view, cards, tables, skeletons, Read more modal and the star icon of the kit.
  // `!important` is not failed by the gate; the kept ones carry their reason in the file (PluginReadMoreModal.vue, PluginCardSkeleton.vue).
  { file: 'src/views/projects/project/plugins/NewPluginCard.vue', strict: true },
  { file: 'src/views/projects/project/plugins/NewPluginTable.vue', strict: true },
  { file: 'src/views/projects/project/plugins/NewPluginTableItemsSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginCard.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginCardSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginIllustrationMain.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginReadMoreModal.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginTable.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginTableItemsSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginTableSortSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/plugins/PluginsSelectSnackbar.vue', strict: true },
  // LITE views/instance/Plugins.vue:207 (`style="min-height: 360px"` on the empty-state card), no colour.
  { file: 'src/views/projects/project/plugins/PluginsView.vue', strict: true, allow: ['style="min-height: 360px"'] },
  // Inline `style` inside the HTML of the modals (v-html of BasicModal; scoped classes do not reach it), 1:1 with LITE mixins/PluginsActionsMixin.js:341 (`margin-top: 24px` / `display: none`) and the rating `<b>` of the install dialog; no colours.
  { file: 'src/views/projects/project/plugins/plugin-actions.ts', strict: true, allow: ['const rating = plugin.rating ? `<b style="margin-left: auto; min-width: 48px">${ratingLabel(plugin.rating)}</b>` : \'\'', '+ `<ul style="${rows ? \'margin-top: 24px\' : \'display: none\'}">${rows}</ul>`,'] },
  // Star of the kit: LITE components/icons/star.vue (`mask-type: alpha` on the `<mask>`, no colour; the fills are the --v-star-* tokens).
  { file: 'src/shared/ui/icons/star.vue', strict: true, allow: ['style="mask-type: alpha"'] },
  // WordPress Config page (ui-instance-wordpress-config, S-96): the view, its table and the modal builders. The only literal is the
  // dialog width, 1:1 with LITE views/instance/advanced/WordpressConfig.vue (`style="width: 560px"` on `basic-modal`), no colour.
  { file: 'src/views/projects/project/advanced/wordpress-config/WordpressConfigView.vue', strict: true, allow: ['style="width: 560px"'] },
  { file: 'src/views/projects/project/advanced/wordpress-config/ConfigsTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-config/configs-table.ts', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-config/wordpress-config-modals.ts', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-config/wordpress-config.api.ts', strict: true },
  // Auto Updates (ui-instance-auto-updates, S-99): the view and its logic modules.
  { file: 'src/views/projects/project/advanced/auto-updates/AutoUpdatesView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/auto-updates/auto-updates-settings.ts', strict: true },
  { file: 'src/views/projects/project/advanced/auto-updates/auto-updates.api.ts', strict: true },
  // Themes page (ui-instance-themes, S-90): every `.vue` of `src/views/projects/project/advanced/themes` is listed below, except NewThemesEmptyIllustration.vue (EXEMPT).
  // LITE views/instance/advanced/Themes.vue:227 (`style="min-height: 360px"` on the empty-state card), no colour.
  { file: 'src/views/projects/project/advanced/themes/ThemesView.vue', strict: true, allow: ['style="min-height: 360px"'] },
  { file: 'src/views/projects/project/advanced/themes/ThemeCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemeTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/NewThemeCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/NewThemeTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemeReadMoreModal.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemeSelectSnackbar.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemesIllustration.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemeCardSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemeTableSkeletonItem.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/ThemeTableSortSkeleton.vue', strict: true },
  { file: 'src/views/projects/project/advanced/themes/NewThemeTableItemSkeleton.vue', strict: true },
  // Inline `style` inside the HTML of the modals (v-html of BasicModal), 1:1 with LITE mixins/ThemesActionsMixin.js (`margin-top: 24px` / `display: none`) and the rating `<b>` of the install dialog (`Themes.vue:565-570`); no colours. Same as plugin-actions.ts.
  { file: 'src/views/projects/project/advanced/themes/theme-actions.ts', strict: true, allow: ['const rating = theme.rating ? `<span style="margin-left: auto; min-width: 48px"><b style="font-size: 13px; line-height: 18px; font-weight: 400">${ratingLabel(theme.rating)}</b></span>` : \'\'', '+ `<ul style="${rows ? \'margin-top: 24px\' : \'display: none\'}">${rows}</ul>`,'] },
  // Connect AI (ui-connect-ai, S-121): the view, its panel, sidebar, tokens, capabilities, activity log and the three token modals,
  // plus the shared MCP steps kit. Every `!important` kept carries its reason in the file (ConnectAiView.scss, McpToolPanel.vue,
  // McpToolSidebar.vue, McpTokenCreateModal.vue, McpTokenRevokeModal.vue, McpTokenModal.vue, McpStep.vue, McpCode.vue); no inline style and no colour literal is left.
  // S-133 (ui-connect-ai-confirm): `disabled` Revoke with the soft warning chip (`.revoke-btn` in McpTokenRevokeModal.vue, 5 `!important`,
  // one per declaration, the reason stated there) and Delete disabled through the app's `bg-error` layer (no `!important`).
  { file: 'src/views/connect-ai/ConnectAiView.vue', strict: true },
  { file: 'src/views/connect-ai/ConnectAiView.scss', strict: true },
  { file: 'src/views/connect-ai/McpActivityLog.vue', strict: true },
  { file: 'src/views/connect-ai/McpActivityLogTableCell.vue', strict: true },
  { file: 'src/views/connect-ai/McpCapabilities.vue', strict: true },
  { file: 'src/entities/mcp/ui/McpTokenCreateModal.vue', strict: true },
  { file: 'src/views/connect-ai/McpTokenDeleteModal.vue', strict: true },
  { file: 'src/views/connect-ai/McpTokenRevokeModal.vue', strict: true },
  { file: 'src/views/connect-ai/McpTokensSection.vue', strict: true },
  { file: 'src/views/connect-ai/McpTokensTableCell.vue', strict: true },
  { file: 'src/views/connect-ai/McpToolPanel.vue', strict: true },
  { file: 'src/views/connect-ai/McpToolSidebar.vue', strict: true },
  { file: 'src/entities/mcp/ui/McpTokenModal.vue', strict: true },
  // MCP entity logic (wizard-summary-page, impl-review F4): `STRICT_DIRS` covers only the `.vue` files, so the modules are listed here.
  { file: 'src/entities/mcp/mcp.api.ts', strict: true },
  { file: 'src/entities/mcp/mcp-url.ts', strict: true },
  { file: 'src/entities/mcp/mcp-tokens.ts', strict: true },
  { file: 'src/shared/ui/mcp/McpStep.vue', strict: true },
  { file: 'src/shared/ui/mcp/McpCode.vue', strict: true },
  // FTP page (ui-ftp, S-105): the hosting view and its logic modules, the project variant (Advanced) and the table shared with SFTP
  // (`hosting-sftp-*` states). No `allow`: the view and the table carry no colour literal and no inline `style=` (the Info modal HTML
  // uses utilities, phase 5). The two `!important` of the usage menu widths in HostingFtpTable.vue are counted by `ui:scan` only.
  { file: 'src/views/hosting/ftp/FtpView.vue', strict: true },
  { file: 'src/views/hosting/ftp/ftp-modals.ts', strict: true },
  { file: 'src/views/hosting/ftp/ftp-accounts.ts', strict: true },
  { file: 'src/views/hosting/ftp/ftp.api.ts', strict: true },
  { file: 'src/views/projects/project/advanced/ftp/AdvancedFtpView.vue', strict: true },
  { file: 'src/views/hosting/ui/HostingFtpTable.vue', strict: true },
  // Cron page (ui-cron, S-108): the hosting view, its logic and API modules, the empty-state illustration (legacy `#797997` is the static
  // token `--v-gray-darken1-static`) and the project variant (Advanced). No `allow`: the modal width is the global `card-width-560` class.
  { file: 'src/views/hosting/cron/CronView.vue', strict: true },
  { file: 'src/views/hosting/cron/HostingCronJobsIllustration.vue', strict: true },
  { file: 'src/views/hosting/cron/cron.ts', strict: true },
  { file: 'src/views/hosting/cron/cron.api.ts', strict: true },
  { file: 'src/views/projects/project/advanced/cron/AdvancedCronView.vue', strict: true },
  // DNS page (ui-hosting-dns, S-115): the hosting view, its illustration and logic/API modules (every `.vue` of `src/views/hosting/dns` is
  // listed, see STRICT_DIRS). No `allow`: the `!important` of the proxy button is gone (scoped rule, phase 3); the icon buttons carry `aria-label`.
  // The frame of My server (single-server services, phase 1) is listed here too: `serviceServerItems` and `isServiceServerPage`.
  { file: 'src/views/hosting/dns/DnsView.vue', strict: true },
  { file: 'src/views/hosting/dns/HostingDnsIllustration.vue', strict: true },
  { file: 'src/views/hosting/dns/dns.ts', strict: true },
  { file: 'src/views/hosting/dns/dns-modals.ts', strict: true },
  { file: 'src/views/hosting/dns/dns-record-fields.ts', strict: true },
  { file: 'src/views/hosting/dns/dns.api.ts', strict: true },
  { file: 'src/views/hosting/hosting-sidebar-items.ts', strict: true },
  { file: 'src/views/hosting/hosting-service.ts', strict: true },
  // Databases page (ui-databases, S-107): the hosting view, its tab strip and logic modules, the project variant (Advanced) and the phpMyAdmin
  // SSO dialogs shared with Developer Settings. No `allow`: no colour literal and no inline `style=` (the modal HTML uses utilities, phase 3).
  // The two `!important` of `.outlined-button` in DatabasesView.scss are counted by `ui:scan` only (they beat the global `_buttons.scss` ones).
  { file: 'src/views/hosting/databases/DatabasesView.vue', strict: true },
  { file: 'src/views/hosting/databases/DatabasesView.scss', strict: true },
  { file: 'src/views/hosting/databases/DatabasesTabs.vue', strict: true },
  { file: 'src/views/hosting/databases/database-modals.ts', strict: true },
  { file: 'src/views/hosting/databases/user-modals.ts', strict: true },
  { file: 'src/views/hosting/databases/privilege-modals.ts', strict: true },
  { file: 'src/views/hosting/databases/databases-table.ts', strict: true },
  { file: 'src/views/hosting/databases/databases.api.ts', strict: true },
  { file: 'src/views/projects/project/advanced/databases/AdvancedDatabasesView.vue', strict: true },
  { file: 'src/entities/sso/ui/PhpMyAdminSsoDialogs.vue', strict: true },
  { file: 'src/entities/sso/ui/PhpMyAdminSsoModal.vue', strict: true },
  // Domains page (ui-domains, S-109): the hosting view, its table, row actions, dialogs and logic modules, and the project variant (Advanced).
  // No `allow`: no colour literal and no inline `style=` (modal widths are `card-width-*` classes, the Edit title uses `text-no-wrap`). The two
  // `!important` of the cell padding and the disabled star in these files are counted by `ui:scan` only and carry their reason in the file.
  { file: 'src/views/hosting/domains/DomainsView.vue', strict: true },
  { file: 'src/views/hosting/domains/DomainsView.scss' },
  { file: 'src/views/hosting/domains/HostingDomainsTable.vue', strict: true },
  { file: 'src/views/hosting/domains/DomainRowActions.vue', strict: true },
  { file: 'src/views/hosting/domains/DomainsActionModal.vue', strict: true },
  { file: 'src/views/hosting/domains/SslCell.vue', strict: true },
  { file: 'src/views/hosting/domains/TransferDomainModal.vue', strict: true },
  { file: 'src/views/hosting/domains/row-actions.ts', strict: true },
  { file: 'src/views/hosting/domains/add-domain.ts', strict: true },
  { file: 'src/views/hosting/domains/domains-actions.ts', strict: true },
  { file: 'src/views/hosting/domains/domains-filter.ts', strict: true },
  { file: 'src/views/hosting/domains/domains-list.ts', strict: true },
  { file: 'src/views/hosting/domains/transfer-domain.ts', strict: true },
  { file: 'src/views/hosting/domains/use-domain-actions.ts', strict: true },
  { file: 'src/views/hosting/domains/use-domains-list.ts', strict: true },
  { file: 'src/views/projects/project/advanced/domains/AdvancedDomainsView.vue', strict: true },
  // SFTP page (ui-sftp, S-106): the hosting view, its logic modules, and the project variant (Advanced). No `allow`: the
  // view carries no colour literal and no inline `style=` (Info modal HTML uses utilities, modal width is `card-width-560`). The menu button
  // is in the shared kit (`shared/ui/buttons`, used by SFTP and the Containers project variant: ui-sftp, ui-containers); the two `!important` of its Actions menu width are counted by `ui:scan` only.
  { file: 'src/views/hosting/sftp/SftpView.vue', strict: true },
  { file: 'src/shared/ui/buttons/QuickActionsButton.vue', strict: true },
  { file: 'src/views/hosting/sftp/sftp-modals.ts', strict: true },
  { file: 'src/views/hosting/sftp/sftp-accounts.ts', strict: true },
  { file: 'src/views/hosting/sftp/sftp.api.ts', strict: true },
  { file: 'src/views/projects/project/advanced/sftp/AdvancedSftpView.vue', strict: true },
  // Containers page (ui-containers, S-110): the My server view and the project variant (Advanced), their port editor, and the logic
  // modules. No `allow`: `ui:scan` finds no colour literal and no inline `style=` (the 1:1 legacy comments do not count). The Actions
  // button is the shared kit `shared/ui/buttons/QuickActionsButton.vue` (strict, listed above with the SFTP entry).
  { file: 'src/views/hosting/containers/ContainersView.vue', strict: true },
  { file: 'src/views/hosting/containers/ContainerPorts.vue', strict: true },
  { file: 'src/views/hosting/containers/ContainersEmpty.vue', strict: true },
  { file: 'src/views/hosting/containers/ContainersEmptyIllustration.vue', strict: true },
  { file: 'src/views/hosting/containers/containers.ts', strict: true },
  { file: 'src/views/hosting/containers/containers.api.ts', strict: true },
  { file: 'src/views/hosting/containers/containers-scope.ts', strict: true },
  { file: 'src/views/projects/project/advanced/containers/AdvancedContainersView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/containers/containers-server-ip.ts', strict: true },
  // Email Forwarders page (ui-email-forwarders, S-117): the My server view, its modal and logic modules and the API module. No `allow`:
  // `ui:scan` finds no colour literal and no inline `style=`. Modal widths use the global `card-width-560` class.
  { file: 'src/views/hosting/email-forwarders/EmailForwardersView.vue', strict: true },
  { file: 'src/views/hosting/email-forwarders/email-forwarder-modals.ts', strict: true },
  { file: 'src/views/hosting/email-forwarders/email-forwarders.ts', strict: true },
  { file: 'src/views/hosting/email-forwarders/email-forwarders.api.ts', strict: true },
  // Billing page (ui-billing, S-119): the view, the invoice table and its skeletons, the status chip and the no-invoices view, plus the
  // logic and API modules. No `allow`: the `!important` of the skeleton row is gone (phase 2), colours come from `--v-status-*` and
  // `--v-skeleton-row-border` tokens.
  { file: 'src/views/account/billing/BillingView.vue', strict: true },
  { file: 'src/views/account/billing/InvoicesTable.vue', strict: true },
  { file: 'src/views/account/billing/InvoicesTableCell.vue', strict: true },
  { file: 'src/views/account/billing/NoAvailableInvoicesView.vue', strict: true },
  { file: 'src/views/account/billing/InvoiceStatusLabel.vue', strict: true },
  { file: 'src/views/account/billing/InvoiceTableSkeletonItem.vue', strict: true },
  { file: 'src/views/account/billing/InvoiceTableItemSkeletonMobile.vue', strict: true },
  { file: 'src/views/account/billing/InvoiceTableSkeletonSort.vue', strict: true },
  { file: 'src/views/account/billing/billing.api.ts', strict: true },
  { file: 'src/views/account/billing/invoices-table.ts', strict: true },
  { file: 'src/views/account/billing/invoice-actions.ts', strict: true },
  // Logs page (ui-instance-logs, S-95): the view, its panels and the log kit. `LogsNoData.vue` (SVG artwork, 14 hex) and `instance-log.ts`
  // (label pill HTML with a colour from the API) are left out on purpose.
  { file: 'src/views/projects/project/advanced/logs/LogsView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/logs/LogsView.scss' },
  { file: 'src/views/projects/project/advanced/logs/LogsTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/logs/LogsTextPanel.vue', strict: true },
  { file: 'src/views/projects/project/advanced/logs/LogLinesTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/logs/log-lines-table.ts', strict: true },
  { file: 'src/views/projects/project/advanced/logs/DeployLogsTab.vue', strict: true },
  { file: 'src/views/projects/project/advanced/logs/DeployLogsTabViewer.vue', strict: true },
  { file: 'src/entities/project/ui/logs/LogItem.vue', strict: true },
  { file: 'src/entities/project/ui/logs/LogItem.scss' },
  { file: 'src/entities/project/ui/logs/UserItem.vue', strict: true },
  // WordPress Users (ui-instance-wordpress-users, S-97): the view, its table and the logic modules. `!important` is not failed by the gate.
  { file: 'src/views/projects/project/advanced/wordpress-users/WordpressUsersView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-users/WordpressUsersTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-users/wordpress-users-modals.ts', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-users/wordpress-users-table.ts', strict: true },
  { file: 'src/views/projects/project/advanced/wordpress-users/wordpress-users.api.ts', strict: true },
  // Users page (ui-instance-users, S-98): the view, its table and the logic modules. `!important` is not failed by the gate.
  { file: 'src/views/projects/project/advanced/users/UsersView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/users/UsersTable.vue', strict: true },
  { file: 'src/views/projects/project/advanced/users/users-modals.ts', strict: true },
  { file: 'src/views/projects/project/advanced/users/users-table.ts', strict: true },
  { file: 'src/views/projects/project/advanced/users/users.api.ts', strict: true },
  // Developer Settings page (ui-instance-developer-settings, S-100): the view, its cards and the two PHP modals; column and field widths are classes, not inline styles.
  { file: 'src/views/projects/project/advanced/developer-settings/DeveloperSettingsView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/InstanceModeCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/PhpSettingsCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/PhpSettingsModal.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/PhpVersionCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/PhpVersionModal.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/SsoLoginCard.vue', strict: true },
  { file: 'src/views/projects/project/advanced/developer-settings/php-settings.ts' },
  // Kit pieces of the page: the switch (`color="primary"`), the card skeleton (the `!important` on the heading margin is legacy `AutoUpdatesCardSkeleton.vue`, no colour).
  // Switch pattern `AppSwitch` and its presets (kit-button-switch, K-14): `ButtonSwitch` below and `DarkModeSwitch`.
  { file: 'src/shared/ui/buttons/AppSwitch.vue', strict: true },
  { file: 'src/shared/ui/buttons/app-switch.ts', strict: true },
  { file: 'src/shared/ui/buttons/ButtonSwitch.vue', strict: true },
  // WordPress MCP page (ui-instance-wordpress-mcp, S-101): the view (the step partial shared with Connect AI is listed with that screen). Dark colours are the `--v-mcp-*` tokens;
  // the three `!important` of `.mcp-code` are annotated in the partial.
  { file: 'src/views/projects/project/advanced/wordpress-mcp/WordpressMcpView.vue', strict: true },
  // Cloudflare page (ui-instance-cloudflare, S-91): every `.vue` of `src/views/projects/project/advanced/cloudflare` is listed (see STRICT_DIRS).
  { file: 'src/views/projects/project/advanced/cloudflare/CloudflareView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/cloudflare/NameserverListItem.vue', strict: true },
  { file: 'src/views/projects/project/advanced/cloudflare/cloudflare-settings.ts' },
  { file: 'src/views/projects/project/advanced/cloudflare/cloudflare.api.ts' },
  // CDN page (ui-instance-cdn, S-93): the view and its two `.ts` modules (every `.vue` of `src/views/projects/project/advanced/cdn` is covered by STRICT_DIRS).
  { file: 'src/views/projects/project/advanced/cdn/CdnView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/cdn/cdn-settings.ts' },
  { file: 'src/views/projects/project/advanced/cdn/cdn.api.ts' },
  // Edge Cache page (ui-instance-edge-cache, S-92): every `.vue` of `src/views/projects/project/advanced/edge-cache` is listed (see STRICT_DIRS).
  { file: 'src/views/projects/project/advanced/edge-cache/EdgeCacheView.vue', strict: true },
  { file: 'src/views/projects/project/advanced/edge-cache/edge-cache-settings.ts' },
  { file: 'src/views/projects/project/advanced/edge-cache/edge-cache.api.ts' },
  // File Manager (ui-file-manager, S-111): treść fm z tokenów aplikacji (`--v-row-hover`, `--v-row-selected`, `--v-gray-*`) i `--v-fm-editor-*` edytora (themes-variables.scss).
  { file: 'src/views/hosting/file-manager/components/FmTableView.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmGridView.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmInfoBlock.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmContextMenu.vue', strict: true },
  { file: 'src/views/hosting/file-manager/FileManagerView.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FileManager.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmBreadcrumb.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmFolderTree.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmManager.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmNavbar.vue', strict: true },
  { file: 'src/views/hosting/file-manager/components/FmThumbnail.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmAudioPlayerModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmClipboardModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmDeleteModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmModalFileName.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmNewFileModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmNewFolderModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmPreviewModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmPropertiesModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmRenameModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmSelectedList.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmStatusModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmUnzipModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmUploadModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmVideoPlayerModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmZipModal.vue', strict: true },
  { file: 'src/views/projects/project/advanced/file-manager/AdvancedFileManagerView.vue', strict: true },
  // File Manager media (S-112, ui-file-manager-media): modal borders from `--v-fm-modal-border`, editor surface from `--v-fm-editor-*`
  { file: 'src/views/hosting/file-manager/modals/FmCropModule.vue', strict: true },
  { file: 'src/views/hosting/file-manager/modals/FmEditorModal.vue', strict: true },
  { file: 'src/views/hosting/file-manager/use-code-editor.ts', strict: true },
  // Set domain modal (ui-instance-set-domain, S-134): the modal and its step logic, and the `.alert-box` kit it uses. `!important` is counted,
  // not failed: the radio pseudo-elements keep `opacity: 1 !important` 1:1 from LITE, and the outlined error trigger beats the global border.
  { file: 'src/views/projects/project/topbar/SetYourDomainModal.vue', strict: true },
  { file: 'src/views/projects/project/topbar/set-domain.ts', strict: true },
  { file: 'src/shared/ui/alert-box/AlertBox.vue', strict: true },
  // Email Addresses page (ui-email-addresses, S-116): the view, its modals and api, the domain records logic and the email kit
  // (`EmailDomainSelector`, `RecordConfiguration`; chip and record icon tokens from phase 1). `AccountConfigurationDetails.vue` is not
  // strict: its two `!important` are the tab colours kept 1:1 with LITE (`AccountConfigurationDetails.vue:144-156`), the gate does not count them.
  { file: 'src/views/hosting/email-addresses/EmailAddressesView.vue', strict: true },
  { file: 'src/views/hosting/email-addresses/AccountConfigurationDetails.vue' },
  { file: 'src/views/hosting/email-addresses/email-account-modals.ts', strict: true },
  { file: 'src/views/hosting/email-addresses/email-accounts.ts', strict: true },
  { file: 'src/views/hosting/email-addresses/email-addresses.api.ts', strict: true },
  { file: 'src/views/hosting/email-domain-records.ts', strict: true },
  { file: 'src/views/hosting/use-email-domain-records.ts', strict: true },
  { file: 'src/views/hosting/ui/EmailDomainSelector.vue', strict: true },
  { file: 'src/views/hosting/ui/RecordConfiguration.vue', strict: true },
  // Services page (ui-services, S-120): every `.vue` of `src/views/account/services` is listed (see STRICT_DIRS), plus its `.ts` modules.
  // No `allow`: no `!important` is left (kit-table-skeleton removed the one of `ServicesTableItemSkeletonMobile.vue`, kit-data-table-account-reseller the one of `ServicesTable.vue`).
  { file: 'src/views/account/services/ServicesView.vue', strict: true },
  { file: 'src/views/account/services/ServicesTable.vue', strict: true },
  { file: 'src/views/account/services/ServicesTableCell.vue', strict: true },
  { file: 'src/views/account/services/CancelServiceButton.vue', strict: true },
  { file: 'src/views/account/services/CustomLabel.vue', strict: true },
  { file: 'src/views/account/services/ServicesTableSkeletonSort.vue', strict: true },
  { file: 'src/views/account/services/ServicesTableSkeletonItem.vue', strict: true },
  { file: 'src/views/account/services/ServicesTableItemSkeletonMobile.vue', strict: true },
  { file: 'src/views/account/services/ServiceLimitsButton.vue', strict: true },
  { file: 'src/views/account/services/ServiceLimitsCell.vue', strict: true },
  { file: 'src/views/account/services/services-cells.ts', strict: true },
  { file: 'src/views/account/services/services-list.ts', strict: true },
  { file: 'src/views/account/services/cancel-service.ts', strict: true },
  { file: 'src/views/account/services/sites-tooltip-location.ts', strict: true },
  { file: 'src/views/account/services/services.api.ts', strict: true },
  // Style Manager drawer (ui-style-manager, S-127): `:style` lines kept 1:1 with LITE (`StyleManagerEditor.vue:24`, `StyleManagerColorGroupPicker.vue:8`).
  // The `!important` of the drawer and of the logo box is counted by `ui:scan` only.
  { file: 'src/views/style-manager/StyleManagerChangeFavicon.vue', strict: true },
  { file: 'src/views/style-manager/StyleManagerChangeLogo.vue', strict: true },
  { file: 'src/views/style-manager/StyleManagerColorGroupPicker.vue', strict: true, allow: [':style="swatchColors"'] },
  { file: 'src/views/style-manager/StyleManagerEditor.vue', strict: true, allow: [':style="`background-color:${currentColor};`"'] },
  { file: 'src/views/style-manager/StyleManagerGroupEditor.vue', strict: true },
  { file: 'src/views/style-manager/StyleManagerLogoBox.vue', strict: true },
  { file: 'src/views/style-manager/StyleManagerMenu.vue', strict: true },
  { file: 'src/views/style-manager/upload-img.scss', strict: true },
  // Dark mode switch (ui-style-manager, S-127): kit component of the drawer, no colour literals.
  { file: 'src/shared/ui/dark-mode-switch/DarkModeSwitch.vue', strict: true },
  // Reseller Area frame and Users page (ui-reseller-users, S-122): strict, no `allow`. The two `!important` left (`ResellerSidebar.vue:88` padding, `UserInstancesTooltip.vue:250` min-width) are counted only by `ui:scan` (2 `important`), not by the gate.
  { file: 'src/views/reseller/ResellerAreaView.vue', strict: true },
  { file: 'src/views/reseller/ResellerSidebar.vue', strict: true },
  { file: 'src/views/reseller/reseller-sidebar-items.ts', strict: true },
  { file: 'src/views/reseller/users/UsersView.vue', strict: true },
  { file: 'src/views/reseller/users/UsersTable.vue', strict: true },
  { file: 'src/views/reseller/users/UsersTableCell.vue', strict: true },
  { file: 'src/views/reseller/users/UserDeleteModal.vue', strict: true },
  { file: 'src/views/reseller/users/UserInstancesTooltip.vue', strict: true },
  { file: 'src/views/reseller/users/users-table.ts', strict: true },
  { file: 'src/views/reseller/users/user-instances-tooltip-location.ts', strict: true },
  // Reseller Email Settings page (ui-reseller-email-settings, S-124): strict, no `allow`.
  { file: 'src/views/reseller/email-settings/EmailSettingsView.vue', strict: true },
  { file: 'src/views/reseller/email-settings/SendTestEmailModal.vue', strict: true },
  { file: 'src/views/reseller/email-settings/email-settings.ts', strict: true },
  { file: 'src/views/reseller/email-settings/email-settings.api.ts', strict: true },
  // Reseller Branding page and the record row kit (ui-reseller-branding, S-123): strict, no `allow`.
  { file: 'src/views/reseller/branding/BrandingView.vue', strict: true },
  { file: 'src/shared/ui/record-box/CopyRecordItem.vue', strict: true },
  // Reseller Area Logs page (ui-reseller-logs, S-125): strict, no `allow`. The one `!important` left (`LogsTable.scss`, the instance log item span
  // beats the Vuetify `d-flex` utility, as in LITE `reseller-area/LogsTableCell.vue:95`) is counted only by `ui:scan` (1 `important`).
  { file: 'src/views/reseller/logs/LogsView.vue', strict: true },
  { file: 'src/views/reseller/logs/LogsTable.vue', strict: true },
  { file: 'src/views/reseller/logs/LogsTableCell.vue', strict: true },
  { file: 'src/views/reseller/logs/LogsTable.scss', strict: true },
  { file: 'src/views/reseller/logs/logs-table.ts', strict: true },
  // Table skeleton pattern (kit-table-skeleton, K-05, KC-03): strict, no `allow`; the variants are scoped blocks, widths and paddings are tokens or legacy values.
  { file: 'src/shared/ui/skeletons/TableSkeletonSort.vue', strict: true },
  { file: 'src/shared/ui/skeletons/TableSkeletonRow.vue', strict: true },
  { file: 'src/shared/ui/skeletons/TableSkeletonMobile.vue', strict: true },
  { file: 'src/shared/ui/skeletons/table-skeleton.ts', strict: true },
  { file: 'src/shared/ui/skeletons/LogsTableSkeletonItem.vue', strict: true },
  { file: 'src/shared/ui/skeletons/LogsTableSortSkeleton.vue', strict: true },
  { file: 'src/shared/ui/skeletons/LogsTableItemSkeletonMobile.vue', strict: true },
  { file: 'src/shared/ui/skeletons/ConfigTableSkeletonItem.vue', strict: true },
  { file: 'src/shared/ui/skeletons/ConfigTableSkeletonSort.vue', strict: true },
  { file: 'src/shared/ui/skeletons/ConfigTableItemSkeletonMobile.vue', strict: true },
  // Devices presets (D13): moved from `EXEMPT`, the colours of the page stay in `DevicesTable.vue`.
  { file: 'src/views/account/profile/DevicesTableSkeletonItem.vue', strict: true },
  { file: 'src/views/account/profile/DevicesTableSkeletonMobileItem.vue', strict: true },
  { file: 'src/views/account/profile/DevicesTableSortSkeleton.vue', strict: true },
  // Reseller Area API page (ui-reseller-api, S-126): strict, no `allow`. The five `!important` left (ApiTokensTable.vue sort header padding, ApiTokenCreateModal.vue field padding) are counted by `ui:scan` only, not by the gate.
  { file: 'src/views/reseller/api/ApiView.vue', strict: true },
  { file: 'src/views/reseller/api/ApiTokensTable.vue', strict: true },
  { file: 'src/views/reseller/api/ApiTokensTableCell.vue', strict: true },
  { file: 'src/views/reseller/api/ApiTokenCreateModal.vue', strict: true },
  { file: 'src/views/reseller/api/ApiTokenDeleteModal.vue', strict: true },
  { file: 'src/views/reseller/api/api-tokens-table.ts', strict: true },
  // Message pattern `AppMessage` (kit-message, K-19, KC-17); presets `AuthMessage`, `AlertBox`, `ErrorCard` are listed above.
  { file: 'src/shared/ui/message/AppMessage.vue', strict: true },
  { file: 'src/shared/ui/message/app-message.ts', strict: true },
  // Kit status chip (kit-status-label, K-18, KC-18): one look for every status chip, colours from the theme tokens.
  { file: 'src/shared/ui/status-label/StatusLabel.vue', strict: true },
  { file: 'src/shared/ui/status-label/status-label.ts', strict: true },
  { file: 'src/entities/project/ui/SuspendChip.vue', strict: true },
  // Drop zone kit (kit-drop-zone, K-24, KC-22): one zone for the status issue upload, the files upload version and the onboarding zip step.
  { file: 'src/shared/ui/drop-zone/DropZone.vue', strict: true },
  { file: 'src/shared/ui/drop-zone/drop-zone.ts', strict: true },
  // Setting card kit (kit-setting-card, K-15, KC-12): the card of the Advanced settings pages and of the phpMyAdmin tab, with its skeleton.
  { file: 'src/shared/ui/setting-card/SettingCard.vue', strict: true },
  { file: 'src/shared/ui/setting-card/SettingCardSkeleton.vue', strict: true },
  // Form field patterns (kit-form-fields, K-20, KC-19): defaults in `form-field.ts`, one look per pattern.
  { file: 'src/shared/ui/form/form-field.ts', strict: true },
  { file: 'src/shared/ui/form/PasswordField.vue', strict: true },
  { file: 'src/shared/ui/form/EmailField.vue', strict: true },
  { file: 'src/shared/ui/form/LabeledField.vue', strict: true },
  { file: 'src/shared/ui/form/SettingsSelect.vue', strict: true },
  // Page frame and General info card (kit-page-frame, K-22): the two kit patterns and their logic.
  { file: 'src/shared/ui/page-frame/PageFrame.vue', strict: true },
  { file: 'src/shared/ui/page-frame/page-frame.ts', strict: true },
  { file: 'src/views/projects/project/general/ui/InfoCard.vue', strict: true },
  { file: 'src/views/projects/project/general/ui/info-card.ts', strict: true },
  // kit-dialog-onboarding (K-23): pattern files of the step card, shell and footer (colour-free, tokens only).
  { file: 'src/shared/ui/modal/OnboardingCard.vue', strict: true },
  { file: 'src/views/onboarding/ui/OnboardingDialog.vue', strict: true },
  { file: 'src/views/onboarding/ui/OnboardingStepFooter.vue', strict: true },
  { file: 'src/views/onboarding/ui/ChoiceCardGrid.vue', strict: true },
  { file: 'src/views/onboarding/ui/ProgressScreen.vue', strict: true },
  // Token created step (kit-token-created, K-27, KC-24): one panel for the reseller API token and the Connect AI token modals.
  { file: 'src/shared/ui/record-box/TokenCreatedPanel.vue', strict: true },
  // Catalogue card of the kit (kit-catalog-card, K-31): the card, its screenshot with the hover buttons and the skeleton.
  // `!important` is not failed by the gate; the kept ones carry their reason in the file (dialog shadow, skeleton bones, `bg-black` hover).
  { file: 'src/entities/project/ui/catalog/CatalogCard.vue', strict: true },
  { file: 'src/entities/project/ui/catalog/CatalogCardMedia.vue', strict: true },
  { file: 'src/entities/project/ui/catalog/CatalogCardSkeleton.vue', strict: true },
  // Read more card of the theme and the plugin pages (kit-read-more-modal, K-30, KC-27). The kept `!important` carry their reason in the file: the iframe pair in the pattern, `min-width` of the preview button in `ThemeReadMoreModal.vue`.
  { file: 'src/views/projects/project/ui/ReadMoreModal.vue', strict: true },
  // Page title, Advanced page layout and the page-add button (kit-button-page-add, K-13, KC-11, KC-04 `page-add`): one look per variant, tokens only.
  { file: 'src/shared/ui/title-row/PageTitle.vue', strict: true },
  { file: 'src/shared/ui/title-row/page-title.ts', strict: true },
  { file: 'src/shared/ui/title-row/TitleRow.vue', strict: true },
  { file: 'src/shared/ui/buttons/PageAddButton.vue', strict: true },
  { file: 'src/views/projects/project/advanced/ui/AdvancedPageLayout.vue', strict: true },
  // Empty state of every place (kit-empty-state, K-17, KC-16): table, card, compact and intro, one look per variant, tokens only.
  { file: 'src/shared/ui/empty-state/EmptyState.vue', strict: true },
  { file: 'src/shared/ui/empty-state/empty-state.ts', strict: true },
]

/** Directories whose every `.vue` must be on the list (or in `EXEMPT`): the screens already cleaned as a whole. */
export const STRICT_DIRS: ReadonlyArray<string> = ['src/views/auth', 'src/views/wizard', 'src/views/account', 'src/app/shell', 'src/entities/project/ui/deploy', 'src/shared/ui/data-iterator', 'src/shared/ui/charts', 'src/views/projects/project/backups', 'src/entities/project/ui/backups', 'src/views/projects/project/plugins', 'src/views/projects/project/advanced/details', 'src/views/account/profile', 'src/views/connect-ai', 'src/entities/mcp', 'src/views/projects/project/advanced/themes', 'src/views/projects/project/advanced/security', 'src/views/projects/project/advanced/developer-settings', 'src/views/hosting/ftp', 'src/views/projects/project/advanced/ftp', 'src/views/projects/project/advanced/users', 'src/views/hosting/databases', 'src/views/projects/project/advanced/databases', 'src/views/hosting/cron', 'src/views/projects/project/advanced/cron', 'src/views/hosting/domains', 'src/views/projects/project/advanced/domains', 'src/views/hosting/sftp', 'src/views/projects/project/advanced/sftp', 'src/views/hosting/file-manager', 'src/views/projects/project/advanced/file-manager', 'src/views/hosting/containers', 'src/views/projects/project/advanced/containers', 'src/views/projects/project/advanced/env-file', 'src/views/projects/project/advanced/cloudflare', 'src/views/projects/project/advanced/cdn', 'src/views/projects/project/advanced/edge-cache', 'src/views/hosting/email-addresses', 'src/views/hosting/email-forwarders', 'src/views/hosting/dns', 'src/views/account/billing', 'src/views/reseller/users', 'src/views/reseller/email-settings', 'src/views/account/services', 'src/views/style-manager', 'src/views/reseller/branding', 'src/shared/ui/record-box', 'src/views/reseller/logs', 'src/views/reseller/api']

/** `.vue` files under `STRICT_DIRS` deliberately not on the list. */
export const EXEMPT: ReadonlyArray<string> = [
  // Onboarding illustrations (ui-onboarding-choice, Phase 6): LITE keeps the same literal artwork colours in light and dark
  // (`#D14F4F`, `#FF004F`, `#EEEEF4`, `#E71D1D` glow); only the `--v-illustrations-*` / `--v-error-base` fills follow the theme
  'src/views/onboarding/illustrations/OnboardingLimitReached.vue',
  'src/views/onboarding/illustrations/OnboardingNoActivePlans.vue',
  'src/views/onboarding/illustrations/ThemeNoData.vue',
  // Backups illustrations (ui-instance-backups, Phase 4): artwork, the `#797997` stroke is the illustration itself (as in shell and onboarding); the colour is kept 1:1 with legacy.
  'src/entities/project/ui/backups/illustrations/DailyBackupIllustration.vue',
  'src/entities/project/ui/backups/illustrations/MonthlyBackupIllustration.vue',
  'src/entities/project/ui/backups/illustrations/WeeklyBackupIllustration.vue',
  // Themes empty-state artwork (ui-instance-themes, Phase 4): 1:1 with LITE `Themes.vue:236-380`; the literals are fixed in both themes, the illustration keeps them.
  'src/views/projects/project/advanced/themes/NewThemesEmptyIllustration.vue',
  // My Account (ui-my-account, S-118): the view, its modals, the devices table and its kit (snackbar on SelectSnackbar).
  // `!important` is not failed by the gate; the kept ones carry their 1:1 LITE reason in the file.
  'src/views/account/profile/DevicesSnackbar.vue',
  'src/views/account/profile/DevicesTable.vue',
  'src/views/account/profile/DevicesTableResponsiveItem.vue',
  'src/views/account/profile/MyAccountModal.vue',
  'src/views/account/profile/MyAccountView.vue',
  'src/views/account/profile/TwoFactorAuthDisableConfirmation.vue',
  'src/views/account/profile/TwoFactorAuthModal.vue',
]
