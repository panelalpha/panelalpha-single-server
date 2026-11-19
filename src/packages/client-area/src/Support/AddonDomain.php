<?php

namespace PanelAlpha\ClientArea\Support;

/**
 * The panel gives every addon domain its `www` alias itself: the Engine adds
 * one to a main domain only, and accepts
 * the alias list in the create body (`POST E:/domains`, openapi-2.3.0).
 */
final class AddonDomain
{
    /**
     * @param  array<string, mixed>  $params  the Engine's domain body
     * @return array<string, mixed>
     */
    public static function withWwwAlias(array $params): array
    {
        $domain = strtolower(trim(Payload::string($params['domain'] ?? null)));

        if (($params['type'] ?? null) !== 'addon' || $domain === '' || str_starts_with($domain, 'www.')) {
            return $params;
        }

        /** @var mixed $given */
        $given = $params['aliases'] ?? null;
        /** @var list<mixed> $aliases */
        $aliases = is_array($given) ? array_values($given) : [];
        $www = 'www.'.$domain;
        if (! in_array($www, $aliases, true)) {
            $aliases[] = $www;
        }
        $params['aliases'] = $aliases;

        return $params;
    }
}
