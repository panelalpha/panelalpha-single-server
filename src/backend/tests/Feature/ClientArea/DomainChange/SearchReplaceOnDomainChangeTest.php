<?php

namespace Tests\Feature\ClientArea\DomainChange;

use Illuminate\Support\Facades\Event;
use PanelAlpha\ClientArea\Events\ProjectDomainChanged;
use PanelAlpha\ClientArea\Listeners\SearchReplaceOnDomainChange;
use Tests\TestCase;

/**
 * The WordPress URL rewrite after a committed domain rename is
 * `SearchReplaceOnDomainChange`. It used to run after legacy's preview-tunnel
 * cleanup; that listener is gone – the Engine's rename deletes the old main
 * domain's tunnels itself – so the search-replace is the only
 * `ProjectDomainChanged` listener. It moved from client-area-legacy into the
 * controller, which registers it once. The behaviour itself is pinned
 * end-to-end by `DomainChangeTest`.
 */
final class SearchReplaceOnDomainChangeTest extends TestCase
{
    public function test_the_controller_runs_the_search_replace_as_the_only_listener(): void
    {
        $listeners = Event::getRawListeners()[ProjectDomainChanged::class] ?? [];

        $this->assertSame([SearchReplaceOnDomainChange::class], $listeners);
    }

    public function test_the_legacy_listener_is_gone(): void
    {
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Listeners\\SearchReplaceOnDomainChange'));
    }
}
