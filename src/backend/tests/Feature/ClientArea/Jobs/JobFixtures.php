<?php

namespace Tests\Feature\ClientArea\Jobs;

use DateTimeInterface;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;

/**
 * Helpers of the Client Area job tests: a mirrored project row made without
 * an Engine call, the Engine listing that keeps it through a sync, and the
 * assertions every watcher shares (the re-dispatched poll, the notification).
 */
trait JobFixtures
{
    use EngineFixtures;

    /**
     * A mirrored project `site1`, as a sync would have stored it.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function bareApplication(array $attributes = []): Application
    {
        $this->configureEngine();

        return Application::query()->create($attributes + [
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_CUSTOM,
        ]);
    }

    /**
     * Fake the Engine's project listing with `site1`, so a sync keeps the row.
     *
     * @param  array<string, mixed>  $overrides
     */
    protected function fakeProjectListing(array $overrides = []): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', $overrides),
        ]])]);
    }

    /**
     * The watcher put the next poll on the queue, `$seconds` from now.
     *
     * @param  class-string  $class
     */
    protected function assertPollQueued(string $class, int $hiccupAttempt, int $seconds): void
    {
        Queue::assertPushed($class, fn (object $job): bool => $job->hiccupAttempt === $hiccupAttempt
            && $job->delay instanceof DateTimeInterface
            && $job->delay->getTimestamp() - now()->getTimestamp() === $seconds);
    }

    protected function assertNotified(string $type, bool $isError, ?string $message = null): void
    {
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->type === $type
            && $event->isError === $isError
            && ($message === null || ($event->payload()['message'] ?? null) === $message));
    }

    protected function assertNotNotified(): void
    {
        Event::assertNotDispatched(ClientAreaNotificationRequested::class);
    }
}
