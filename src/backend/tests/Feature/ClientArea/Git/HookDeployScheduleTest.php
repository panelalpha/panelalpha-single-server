<?php

namespace Tests\Feature\ClientArea\Git;

use Illuminate\Console\Scheduling\CallbackEvent;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Jobs\Git\FollowGitHookDeploysJob;
use Tests\TestCase;

/**
 * The hook-deploy follower was first scheduled from client-area-legacy's
 * provider (`follow-git-hook-deploys`, every five minutes, no overlap). It moved
 * with the auto-deploy hooks into the controller's provider unchanged: the same
 * name (the overlap mutex is derived from it, so a running follower still
 * blocks the next one across the deploy), frequency, overlap guard and job.
 */
final class HookDeployScheduleTest extends TestCase
{
    public function test_the_follower_keeps_its_name_frequency_and_overlap_guard(): void
    {
        $events = array_values(array_filter(
            $this->app->make(Schedule::class)->events(),
            static fn (Event $event): bool => $event->description === 'follow-git-hook-deploys',
        ));

        $this->assertCount(1, $events, 'follow-git-hook-deploys must be scheduled exactly once.');
        $event = $events[0];
        $this->assertInstanceOf(CallbackEvent::class, $event);
        $this->assertSame('*/5 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertSame('framework/schedule-'.sha1('follow-git-hook-deploys'), $event->mutexName());

        Queue::fake();
        $event->run($this->app);
        Queue::assertPushed(FollowGitHookDeploysJob::class);
    }
}
