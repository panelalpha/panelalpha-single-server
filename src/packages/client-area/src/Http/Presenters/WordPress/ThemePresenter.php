<?php

namespace PanelAlpha\ClientArea\Http\Presenters\WordPress;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes a WordPress theme row the way the CA reads it (old
 * `packages/api/app/Http/Resources/ThemeResource.php:79-91`): the Engine
 * `wp/themes` list plus the panel-owned `async_status`.
 */
final class ThemePresenter
{
    /**
     * @param  list<array<string, mixed>>  $themes
     * @return list<array<string, mixed>>
     */
    public function presentList(Application $application, array $themes): array
    {
        $statuses = $this->asyncStatus($application, WordPressAsyncStatus::THEME);

        return array_map(fn (array $theme) => $this->present($application, $theme, $statuses[Payload::string($theme['name'] ?? '')] ?? []), $themes);
    }

    /**
     * @param  array<string, mixed>  $theme
     * @param  array<string, string>  $asyncStatus
     * @return array<string, mixed>
     */
    public function present(Application $application, array $theme, array $asyncStatus = []): array
    {
        return [
            'type' => 'marketplace',
            'name' => $theme['name'] ?? null,
            'status' => $theme['status'] ?? null,
            'update' => $theme['update'] ?? null,
            'version' => $theme['version'] ?? null,
            'title' => $theme['title'] ?? null,
            'description' => $theme['description'] ?? null,
            'update_version' => $theme['update_version'] ?? null,
            'zip_path' => null,
            'application_id' => $application->id,
            'async_status' => $asyncStatus,
        ];
    }

    /**
     * A wordpress.org search row as the CA reads it (NewThemeCard/
     * NewThemeTable): the raw Engine row (WP-CLI `theme search --format=json`
     * carries `slug`/`rating`, which the install action and the rating badge
     * need) plus the CA's defaults. `presentList()` is for an *installed* theme
     * and would drop those keys.
     *
     * @param  array<string, mixed>  $theme
     * @return array<string, mixed>
     */
    public function presentSearch(array $theme): array
    {
        return array_merge([
            'type' => 'marketplace',
            'name' => $theme['name'] ?? null,
            'status' => $theme['status'] ?? null,
            'update' => $theme['update'] ?? null,
            'version' => $theme['version'] ?? null,
            'title' => $theme['title'] ?? null,
            'description' => $theme['description'] ?? null,
            'update_version' => $theme['update_version'] ?? null,
            'zip_path' => null,
            'application_id' => null,
            'async_status' => [],
            'featured' => false,
            'slug' => $theme['slug'] ?? null,
            'rating' => $theme['rating'] ?? null,
            'screenshot_url' => $theme['screenshot_url'] ?? null,
            'preview_url' => $theme['preview_url'] ?? null,
            'id' => $theme['id'] ?? null,
        ], $theme);
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function asyncStatus(Application $application, string $type): array
    {
        $map = [];
        foreach (WordPressAsyncStatus::query()->where('application_id', $application->id)->where('type', $type)->get() as $row) {
            $map[$row->name][$row->action] = $row->status;
        }

        return $map;
    }
}
