<?php

namespace PanelAlpha\ClientArea\Http\Presenters\WordPress;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes a WordPress plugin row the way the CA reads it (old
 * `packages/api/app/Http/Resources/PluginResource.php:168-183`): the Engine
 * `wp/plugins` list (WP-CLI `plugin list --format=json`) plus the panel-owned
 * `async_status` and the CA-gated placeholders.
 */
final class PluginPresenter
{
    /**
     * @param  list<array<string, mixed>>  $plugins
     * @return list<array<string, mixed>>
     */
    public function presentList(Application $application, array $plugins): array
    {
        $statuses = $this->asyncStatus($application, WordPressAsyncStatus::PLUGIN);

        $rows = array_map(fn (array $plugin) => $this->present($application, $plugin, $statuses[Payload::string($plugin['name'] ?? '')] ?? []), $plugins);

        // Old `PluginCollection::fromRemoteApp:56-64`: a pending
        // or running operation on a plugin WordPress does not list yet (an
        // install) is shown as its own row; the panel keeps no plugin details,
        // so the row carries the name and the placeholders.
        $listed = array_flip(array_map(static fn (array $plugin): string => Payload::string($plugin['name'] ?? ''), $plugins));
        foreach ($statuses as $name => $status) {
            if (isset($listed[$name]) || array_intersect([WordPressAsyncStatus::PENDING, WordPressAsyncStatus::IN_PROGRESS], $status) === []) {
                continue;
            }

            $rows[] = $this->present($application, ['name' => $name], $status);
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $plugin
     * @param  array<string, string>  $asyncStatus
     * @return array<string, mixed>
     */
    public function present(Application $application, array $plugin, array $asyncStatus = []): array
    {
        return [
            'name' => $plugin['name'] ?? null,
            'status' => $plugin['status'] ?? null,
            'update' => $plugin['update'] ?? null,
            'version' => $plugin['version'] ?? null,
            // Listed with `WordPressApi::LIST_FIELDS`, which asks for both.
            'title' => $plugin['title'] ?? null,
            'description' => $plugin['description'] ?? null,
            'update_version' => $plugin['update_version'] ?? null,
            'application_id' => $application->id,
            'async_status' => $asyncStatus,
            'featured' => false,
            'activation_disabled' => false,
        ];
    }

    /**
     * A wordpress.org search row as the CA reads it (NewPluginCard/
     * NewPluginTable): the raw Engine row (WP-CLI `plugin search --format=json`
     * carries `slug`/`rating`/`active_installs`, which the install action and
     * the rating/installs badges need) plus the CA's defaults. `presentList()`
     * is for an *installed* plugin and would drop those keys.
     *
     * @param  array<string, mixed>  $plugin
     * @return array<string, mixed>
     */
    public function presentSearch(array $plugin): array
    {
        return array_merge([
            'name' => $plugin['name'] ?? null,
            'status' => $plugin['status'] ?? null,
            'update' => $plugin['update'] ?? null,
            'version' => $plugin['version'] ?? null,
            'title' => $plugin['title'] ?? null,
            'description' => $plugin['description'] ?? null,
            'update_version' => $plugin['update_version'] ?? null,
            'application_id' => null,
            'async_status' => [],
            'featured' => false,
            'activation_disabled' => false,
            'slug' => $plugin['slug'] ?? null,
            'rating' => $plugin['rating'] ?? null,
            'active_installs' => $plugin['active_installs'] ?? null,
            'short_description' => $plugin['short_description'] ?? null,
            'tested' => $plugin['tested'] ?? null,
            'id' => $plugin['id'] ?? null,
        ], $plugin);
    }

    /**
     * @return array<string, array<string, string>>  name => {action: status}
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
