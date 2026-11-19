<?php

/**
 * Panel strings that the Client Area sees inside structured payloads, not on
 * their own page. `self_signed` is the old panel's certificate label
 * (`packages/api/resources/lang/en/api/general.php:12`): an SSL certificate
 * answers with a self-signed flag, and both the certificate modal and the
 * security page show this text instead of the Engine's issuer name for one.
 */
return [
    'self_signed' => 'Self Signed',

    // The old `api/general` entity names and refusal message a project in
    // diagnostic mode answers with (old `HealthCheck::validateEntity()`, the
    // paid `DiagnosticMode` seam).
    'instance' => 'instance',
    'hosting_account' => 'hosting account',
    'entity_diagnostic_mode_enabled' => 'Managing the :entity is currently not possible (Diagnostic Mode). Please contact support for more details.',
    // Old api/custom_validation.php:131.
    'wordpress_sso_user_restricted' => 'WordPress SSO is restricted to your assigned account.',

    // project-usage: PUT /projects/{id}/limits.
    'limits_staging_refused' => 'Limits cannot be changed on a staging project.',
    'limit_unlimited_or_positive' => 'The :attribute must be -1 (no limit) or at least 1.',
    'limit_unlimited_or_min_cpu' => 'The :attribute must be -1 (no limit) or at least :min.',
];
