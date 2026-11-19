<?php

/**
 * The CA notification texts (`html_text`). Keys are the exact CA types the
 * panel broadcasts; `:name` is the project name.
 */
return [
    'user' => [
        'instance' => [
            'installation_finished' => 'Installation of :name finished.',
            'installation_failed' => 'Installation of :name failed.',
            'redeploy_finished' => 'Redeployment of :name finished.',
            'redeploy_failed' => 'Redeployment of :name failed.',
            'create_staging_finished' => 'Staging copy of :name created.',
            'create_staging_failed' => 'Staging copy of :name failed.',
            'push_to_live_finished' => 'Push of :name to live finished.',
            'push_to_live_failed' => 'Push of :name to live failed.',
            'push_to_staging_finished' => 'Push of :name to staging finished.',
            'push_to_staging_failed' => 'Push of :name to staging failed.',
            'update_wordpress_finished' => 'WordPress update of :name finished.',
            'update_wordpress_failed' => 'WordPress update of :name failed.',
            'git_auto_deploy_finished' => 'Auto-deploy of :name finished.',
            'git_auto_deploy_failed' => 'Auto-deploy of :name failed.',
            'backup' => [
                'create_finished' => 'Backup of :name created.',
                'create_failed' => 'Backup of :name failed.',
                'restore_finished' => 'Backup restored for :name.',
                'restore_failed' => 'Backup restore for :name failed.',
                'delete_finished' => 'Backup of :name deleted.',
                'delete_failed' => 'Backup deletion for :name failed.',
            ],
            'plugin' => [
                'install_finished' => 'Plugin installed on :name.',
                'install_failed' => 'Plugin installation on :name failed.',
                'update_finished' => 'Plugin updated on :name.',
                'update_failed' => 'Plugin update on :name failed.',
            ],
            'theme' => [
                'install_finished' => 'Theme installed on :name.',
                'install_failed' => 'Theme installation on :name failed.',
                'update_finished' => 'Theme updated on :name.',
                'update_failed' => 'Theme update on :name failed.',
            ],
            'wordpress_mcp' => [
                'enable_finished' => 'WordPress MCP enabled on :name.',
                'enable_failed' => 'Enabling WordPress MCP on :name failed.',
                'disable_finished' => 'WordPress MCP disabled on :name.',
                'disable_failed' => 'Disabling WordPress MCP on :name failed.',
            ],
        ],
        'service' => [
            'sync_hosting_account' => [
                'finished' => 'Hosting account of :name synced.',
                'failed' => 'Syncing the hosting account of :name failed.',
            ],
        ],
    ],
];
