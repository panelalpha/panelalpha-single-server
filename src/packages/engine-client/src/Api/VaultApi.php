<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine's secret vault (Engine 2.3.0; only on an Engine that
 * lists `project_source`). A vault entry is used by its `ref`
 * (`vault:<random key>`) exactly as the Engine answers it, never built from
 * its `id`.
 *
 * Engine: core/app/Http/Controllers/SecretVaultController.php.
 */
final class VaultApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * Generate an SSH deploy key before any project exists (`POST
     * /vault/deploy-keys`, 201). The answer carries `ref`, `public_key`,
     * `fingerprint` and `hosts[]` (`{host, pinned, fingerprints}`), never the
     * private half. The customer adds `public_key` to the repository; the key
     * then goes as `source.auth: {type: deploy_key, key: <ref>}` with an SSH
     * URL. A `project`-scope key is claimed by the first project that uses it.
     * 422 `host_invalid` / `host_unreachable` on `host`.
     *
     * Engine: core/routes/api.php:131 -> SecretVaultController::storeDeployKey
     * (`VaultDeployKeyStoreRequest`).
     *
     * @param  array{scope?: 'project'|'global', project?: string, purpose?: string, host?: string, expires_in?: int}  $params
     *         `host` only for a git server other than github.com, gitlab.com and bitbucket.org
     * @return array<string, mixed>
     */
    public function createDeployKey(array $params = []): array
    {
        return Payload::object($this->engine->post('vault/deploy-keys', array_filter(
            $params,
            static fn (mixed $value): bool => $value !== null && $value !== '',
        ))->json('data'));
    }
}
