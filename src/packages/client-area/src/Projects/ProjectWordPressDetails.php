<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * What the General page's Installation card (and Site Details) shows for a
 * WordPress project: the core version (`version`), the core versions it can
 * be updated to (`update_details.available_updates`) and the installed
 * plugins (`plugin_details`, from which the CA reads WooCommerce's version).
 * The CA builds `status.wordpress`, `status.wordpress_available` and
 * `status.woocommerce` from those three keys (`instanceResource`); without
 * them the card says "Not Installed" for a site that is installed.
 *
 * Like {@see ProjectSourceDetails}: only the single project answer carries
 * it, and the answer never calls the Engine. It reads the
 * facts from the cache and, when they are missing or older than
 * FRESH_SECONDS, queues {@see RefreshProjectWordPressJob}. Stale facts are
 * still shown while the refresh runs, so the card never falls back to empty;
 * a WordPress install, every finished WordPress action and a plugin removal
 * refresh the cache themselves ({@see self::refresh()},
 * {@see self::pluginsChanged()}), so the card is right when the CA reloads the
 * project after them.
 */
final class ProjectWordPressDetails
{
    /** Facts older than this are still shown, and the view queues a refresh. */
    public const FRESH_SECONDS = 300;

    /** How long refreshed facts are kept at all. */
    public const KEEP_SECONDS = 86400;

    public function __construct(private readonly WordPressService $wordpress) {}

    /**
     * The presented project with its WordPress facts filled in; a project that
     * is not a WordPress one is returned unchanged.
     *
     * @param  array<string, mixed>  $project
     * @return array<string, mixed>
     */
    public function apply(Application $application, array $project): array
    {
        if (($project['type'] ?? null) !== Application::TYPE_WORDPRESS) {
            return $project;
        }

        $cached = $this->cached($application);
        $refreshedAt = Payload::int($cached['refreshed_at'] ?? null);
        if ($refreshedAt === null || $refreshedAt < now()->getTimestamp() - self::FRESH_SECONDS) {
            RefreshProjectWordPressJob::dispatch($application->id)->onConnection('database');
        }

        $facts = Payload::object($cached['facts'] ?? null);
        if ($facts === []) {
            return $project;
        }

        $project['version'] = Payload::nullableString($facts['version'] ?? null);
        $project['update_details'] = ['available_updates' => Payload::strings($facts['available_updates'] ?? null)];
        $project['plugin_details'] = Payload::objects($facts['plugins'] ?? null);

        return $project;
    }

    /**
     * Read the facts from the Engine and keep them (the queued refresh, and
     * the install and action jobs). A part the Engine fails to answer keeps its
     * previous value; the timestamp moves on either way, so a failing site is
     * retried every FRESH_SECONDS, not on every view. Best effort: it runs at
     * the end of an install or a WordPress action, which must never fail
     * because this cache could not be refreshed, so no failure leaves it.
     */
    public function refresh(Application $application): void
    {
        $cached = $this->cached($application);
        $revision = Payload::int($cached['revision'] ?? null) ?? 0;
        $previous = Payload::object($cached['facts'] ?? null);
        $facts = $previous;

        try {
            $updates = $this->wordpress->updates($application);
            $facts['version'] = Payload::nullableString($updates['wp_version'] ?? null);
            $facts['available_updates'] = Payload::strings($updates['available_updates'] ?? null);
        } catch (Throwable $e) {
            report($e);
        }

        try {
            $facts['plugins'] = $this->wordpress->plugins($application);
        } catch (Throwable $e) {
            report($e);
        }

        // A change the panel made while this read was out has newer facts.
        if ($this->revision($application) !== $revision) {
            return;
        }

        Cache::put(
            self::cacheKey($application),
            ['facts' => $facts, 'refreshed_at' => now()->getTimestamp(), 'revision' => $revision + 1],
            self::KEEP_SECONDS,
        );
    }

    /**
     * The plugin list read right after a removal; an older refresh cannot overwrite it.
     *
     * @param  list<array<string, mixed>>  $plugins
     */
    public function pluginsChanged(Application $application, array $plugins): void
    {
        $cached = $this->cached($application);
        if ($cached === []) {
            return;
        }

        $facts = Payload::object($cached['facts'] ?? null);
        $facts['plugins'] = $plugins;

        Cache::put(
            self::cacheKey($application),
            [
                'facts' => $facts,
                'refreshed_at' => Payload::int($cached['refreshed_at'] ?? null) ?? now()->getTimestamp(),
                'revision' => (Payload::int($cached['revision'] ?? null) ?? 0) + 1,
            ],
            self::KEEP_SECONDS,
        );
    }

    public function hasEntry(Application $application): bool
    {
        return $this->cached($application) !== [];
    }

    public static function cacheKey(Application $application): string
    {
        return 'client-area:project-wordpress:'.$application->id;
    }

    /**
     * @return array<string, mixed>
     */
    private function cached(Application $application): array
    {
        return Payload::object(Cache::get(self::cacheKey($application)));
    }

    private function revision(Application $application): int
    {
        return Payload::int($this->cached($application)['revision'] ?? null) ?? 0;
    }
}
