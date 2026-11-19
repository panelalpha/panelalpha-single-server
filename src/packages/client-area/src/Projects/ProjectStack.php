<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * The Stack/Version label of a project on the admin lists and details (old
 * `App\Lib\Project\ProjectStack`, packages/api/app/Lib/Project/ProjectStack.php):
 * the detected stack's label when there is one, else WordPress (with its
 * version), the files source, a known recipe repository or the git repository
 * name.
 */
final class ProjectStack
{
    /**
     * First-party source-recipe repositories; an unknown repository falls back
     * to its name.
     *
     * @var array<string, string>
     */
    public const KNOWN_REPO_LABELS = [
        'n8n-io/n8n' => 'n8n',
        'chatwoot/chatwoot' => 'Chatwoot',
        'umami-software/umami' => 'Umami',
        'activepieces/activepieces' => 'Activepieces',
        'knadh/listmonk' => 'listmonk',
        'calcom/cal.diy' => 'Cal.com',
        'wordpress/wordpress' => 'WordPress',
    ];

    /**
     * @param  array<string, mixed>|null  $detected
     */
    public static function label(string $type, ?string $version, ?string $sourceType, ?string $repoName, ?array $detected): string
    {
        $cached = Payload::nullableString($detected['label'] ?? null);
        if ($cached !== null && $cached !== '') {
            return $cached;
        }

        if ($type !== 'custom') {
            return $version !== null && $version !== '' ? 'WordPress '.$version : 'WordPress';
        }

        if ($sourceType === 'files') {
            return 'Docker (files)';
        }

        if ($repoName !== null && $repoName !== '') {
            return self::KNOWN_REPO_LABELS[strtolower($repoName)] ?? 'Git · '.$repoName;
        }

        return 'Custom';
    }

    /**
     * Whether the stack cell uses the WordPress version's outdated colouring.
     *
     * @param  array<string, mixed>|null  $detected
     */
    public static function usesWordpressVersionColoring(string $type, ?string $version, ?array $detected): bool
    {
        if ($type === 'custom') {
            return false;
        }

        $source = Payload::nullableString($detected['source'] ?? null);
        if ($source !== null && $source !== '' && $source !== 'wordpress') {
            return false;
        }

        return $version !== null && $version !== '';
    }

    /**
     * `owner/name` of a repository URL, or null.
     */
    public static function parseRepoName(?string $repoUrl): ?string
    {
        if ($repoUrl === null || $repoUrl === '') {
            return null;
        }

        $path = parse_url($repoUrl, PHP_URL_PATH);
        if (! is_string($path) || $path === '') {
            return null;
        }

        $path = preg_replace('#\.git$#', '', trim($path, '/'));
        if (! is_string($path) || $path === '') {
            return null;
        }

        $parts = array_values(array_filter(explode('/', $path), static fn (string $part): bool => $part !== ''));
        $count = count($parts);
        if ($count >= 2) {
            return $parts[$count - 2].'/'.$parts[$count - 1];
        }

        return $parts[0] ?? null;
    }
}
