<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes Engine domains the way the Client Area reads them (migration
 * section L, old User\ServerAccount\DomainResource).
 *
 * The Engine DomainResource carries `details` (document_root, redirect_*,
 * force_https_redirect, aliases); the CA reads those keys at the top level and
 * expects `has_dns_zone`/`domain_zone`/`domain_ssl_details` placeholders (DNS
 * servers are disabled in single-server → no zones; SSL is fetched separately).
 */
final class DomainPresenter
{
    /**
     * @param  array<string, mixed>  $domain  Engine DomainResource
     * @param  string|null  $serverAccountId
     * @return array<string, mixed>
     */
    public function present(array $domain, ?string $serverAccountId = null): array
    {
        $details = Payload::object($domain['details'] ?? null);

        return [
            'id' => $domain['id'] ?? null,
            'domain' => $domain['domain'] ?? '',
            'type' => $domain['type'] ?? 'addon',
            'document_root' => $details['document_root'] ?? null,
            'redirect_enabled' => (bool) ($details['redirect_enabled'] ?? false),
            'redirect_url' => $details['redirect_url'] ?? null,
            'force_https_redirect' => (bool) ($details['force_https_redirect'] ?? false),
            'aliases' => Payload::strings($details['aliases'] ?? null),
            'created_at' => $domain['created_at'] ?? null,
            'updated_at' => $domain['updated_at'] ?? null,
            'ssl_order_status' => 'none',
            'server_account_id' => $serverAccountId,
            'domain_ssl_details' => null,
            'domain_zone' => null,
            'has_dns_zone' => false,
            'cdn_dns_records' => [],
            // Old `getCapabilities()` (CA HostingDomainsTable.vue:160,187,212).
            'capabilities' => $this->capabilities(Payload::string($domain['type'] ?? 'addon')),
        ];
    }

    /**
     * The old per-type capability rules over the classic driver
     * (`AbstractHostingServer/Account/AbstractDomains.php:102-132`): primary only
     * for main/addon, SSL never for an alias, docroot/redirect for the four
     * known types.
     *
     * @return array<string, bool>
     */
    private function capabilities(string $type): array
    {
        $known = in_array($type, ['main', 'addon', 'sub', 'alias'], true);

        return [
            'can_update_document_root' => $known,
            'can_redirect' => $known,
            'can_set_as_primary' => in_array($type, ['main', 'addon'], true),
            'can_manage_ssl' => $type !== 'alias',
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $domains
     * @return list<array<string, mixed>>
     */
    public function presentList(array $domains, ?string $serverAccountId = null): array
    {
        return array_map(fn (array $d) => $this->present($d, $serverAccountId), $domains);
    }
}
