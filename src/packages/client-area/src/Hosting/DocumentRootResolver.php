<?php

namespace PanelAlpha\ClientArea\Hosting;

use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The project's document root as a home-relative path.
 *
 * On the Engine the document root is a **domain** detail, not a project one, so
 * it comes from the main domain; a classic project falls back to
 * `{domain}/public_html`, the Engine's layout for a site created from a domain.
 */
final class DocumentRootResolver
{
    public function documentRoot(Application $application): string
    {
        try {
            $domains = (new DomainsApi($application->engine()))->domains($application->engineProject());
        } catch (\Throwable) {
            $domains = [];
        }

        $main = null;
        foreach ($domains as $candidate) {
            if (($candidate['type'] ?? null) === 'main') {
                $main = $candidate;
                break;
            }
        }

        $details = $main === null ? [] : Payload::object($main['details'] ?? null);
        $docroot = Payload::nullableString($details['document_root'] ?? null);
        if ($docroot !== null && $docroot !== '' && $docroot !== '/') {
            return ltrim($docroot, '/');
        }

        $domain = (string) ($application->domain ?? '');

        return $domain === '' ? '' : $domain.'/public_html';
    }

    /**
     * The Engine `path` of the WordPress install the panel made: the document
     * root plus the install's directory, home-relative as the `wp/*` endpoints
     * read it. Null when the panel installed no WordPress into a subdirectory,
     * so those calls keep the Engine's default of the document root.
     */
    public function wordpressInstallPath(Application $application): ?string
    {
        $directory = $application->wordpressDirectory();
        if ($directory === null || $directory === '') {
            return null;
        }

        $documentRoot = trim($this->documentRoot($application), '/');

        return $documentRoot === '' ? $directory : $documentRoot.'/'.$directory;
    }
}
