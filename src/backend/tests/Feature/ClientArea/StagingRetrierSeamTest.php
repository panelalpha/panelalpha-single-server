<?php

namespace Tests\Feature\ClientArea;

use PanelAlpha\ClientArea\Contracts\StagingRetrier;
use PanelAlpha\ClientArea\Projects\DeleteAndRecreateStagingRetrier;
use Tests\TestCase;

/**
 * The retry-staging workaround is behind `StagingRetrier`. The Engine needs no
 * change for it, so the delete-and-re-create retrier moved
 * from client-area-legacy into the controller as the seam's default and the
 * refusing `NullStagingRetrier` (with its old-style 422 case) was deleted. The
 * retry itself is pinned end-to-end by `StagingTest` / `WatchStagingJobTest`.
 */
final class StagingRetrierSeamTest extends TestCase
{
    public function test_the_controller_binds_the_delete_and_recreate_retrier(): void
    {
        $this->assertInstanceOf(DeleteAndRecreateStagingRetrier::class, app(StagingRetrier::class));
    }

    public function test_the_legacy_retrier_and_the_null_default_are_gone(): void
    {
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Projects\\DeleteAndRecreateStagingRetrier'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Projects\\NullStagingRetrier'));
    }
}
