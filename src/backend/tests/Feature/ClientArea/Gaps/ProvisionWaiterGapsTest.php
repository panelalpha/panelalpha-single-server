<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Provisioning\ProvisionWaiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * ProvisionWaiter: how a failed create task and a refused project read turn
 * into the message the owner sees.
 */
class ProvisionWaiterGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function failedTaskProvider(): array
    {
        return [
            'the Engine error' => [['error' => 'No disk space left.'], 'No disk space left.'],
            'the first problem with a message' => [['problems' => [['message' => ''], ['message' => 'The domain is invalid.']]], 'The domain is invalid.'],
            'nothing the panel can show' => [['problems' => [['message' => '']]], 'The Engine could not create the project.'],
            'no details at all' => [[], 'The Engine could not create the project.'],
        ];
    }

    /**
     * @param  array<string, mixed>  $details
     */
    #[DataProvider('failedTaskProvider')]
    public function test_a_failed_create_task_tells_the_most_useful_message(array $details, string $message): void
    {
        Sleep::fake();
        $application = $this->syncedApplication(User::factory()->create());

        // Engine: core/app/Http/Controllers/TaskController.php:207 -> show (a failed task)
        Http::fake(['engine.example.com/api/tasks/61*' => Http::response(['data' => ['id' => 61, 'status' => 'failed', 'details' => $details]])]);

        try {
            app(ProvisionWaiter::class)->wait($application, 61);
            $this->fail('A failed task must stop the wait.');
        } catch (ValidationException $e) {
            $this->assertSame([$message], $e->errors()['domain']);
        }
    }

    public function test_a_project_the_engine_refuses_to_show_after_a_finished_task_is_a_domain_error(): void
    {
        Sleep::fake();
        $application = $this->syncedApplication(User::factory()->create());

        // Engine: core/app/Http/Controllers/TaskController.php:207 -> show (completed)
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::show (422)
        Http::fake([
            'engine.example.com/api/tasks/61*' => Http::response(['data' => ['id' => 61, 'status' => 'completed']]),
            'engine.example.com/api/projects/site1' => Http::response(['message' => 'The project is not ready.', 'errors' => ['project' => ['The project is not ready.']]], 422),
        ]);

        try {
            app(ProvisionWaiter::class)->wait($application, 61);
            $this->fail('A refused read must stop the wait.');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors()['domain'][0]);
        }
    }
}
