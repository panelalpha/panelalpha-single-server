<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\DeployTaskTail;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Projects\GitOperationLog;
use PanelAlpha\ClientArea\Projects\GitService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * GitOperationLog and its models: webhook deliveries, the history page size,
 * a commit the Engine cannot read and rows the panel cannot decode.
 */
class GitOperationLogGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(): Application
    {
        return $this->syncedApplication(User::factory()->create(), 'site1', [
            'details' => ['git_repo' => 'https://github.com/acme/site', 'git_branch' => 'main'],
        ]);
    }

    private function log(): GitOperationLog
    {
        return app(GitOperationLog::class);
    }

    public function test_a_webhook_delivery_without_a_commit_is_not_recorded(): void
    {
        $application = $this->application();

        $this->log()->recordWebhookPull($application, ['outcome' => 'accepted'], now(), true, 'deployed');

        $this->assertSame(0, GitOperation::query()->count());
    }

    public function test_a_settled_webhook_delivery_is_not_recorded_again(): void
    {
        $application = $this->application();
        $at = Carbon::parse('2026-10-10 12:00:00');
        $delivery = ['commit' => 'abc123', 'outcome' => 'accepted'];

        $this->log()->recordWebhookPull($application, $delivery, $at, true, 'deployed');
        $this->log()->recordWebhookPull($application, $delivery, $at, true, 'failed');

        $this->assertSame(1, GitOperation::query()->count());
        $this->assertSame(GitOperation::STATUS_SUCCESS, GitOperation::query()->firstOrFail()->status);
    }

    public function test_a_running_webhook_delivery_is_settled_on_the_next_import(): void
    {
        $application = $this->application();
        $at = Carbon::parse('2026-10-10 12:00:00');
        $delivery = ['commit' => 'abc123', 'outcome' => 'accepted', 'detail' => 'Build failed.'];

        $this->log()->recordWebhookPull($application, $delivery, $at, false, null);
        $this->assertSame(GitOperation::STATUS_IN_PROGRESS, GitOperation::query()->firstOrFail()->status);

        $this->log()->recordWebhookPull($application, $delivery, $at, true, 'failed');

        $this->assertSame(1, GitOperation::query()->count());
        $operation = GitOperation::query()->firstOrFail();
        $this->assertSame(GitOperation::STATUS_FAILED, $operation->status);
        $this->assertSame('Build failed.', $operation->error_message);
    }

    public function test_a_superseded_webhook_delivery_is_skipped(): void
    {
        $application = $this->application();

        $this->log()->recordWebhookPull($application, ['commit' => 'abc123', 'outcome' => 'accepted'], now(), true, 'superseded');

        $operation = GitOperation::query()->firstOrFail();
        $this->assertSame(GitOperation::STATUS_SKIPPED, $operation->status);
        $this->assertSame(GitService::ALREADY_UP_TO_DATE_MESSAGE, $operation->error_message);
    }

    public function test_history_falls_back_to_ten_rows_for_a_page_size_out_of_range(): void
    {
        $application = $this->application();
        foreach (range(1, 12) as $i) {
            GitOperation::query()->create([
                'application_id' => $application->id,
                'action' => GitOperation::ACTION_PULL,
                'status' => GitOperation::STATUS_SUCCESS,
            ]);
        }

        $history = $this->log()->history($application, ['per_page' => 500]);

        $this->assertSame(10, $history['meta']['per_page']);
        $this->assertCount(10, $history['data']);
        $this->assertSame(12, $history['meta']['total']);
    }

    public function test_a_recorded_operation_keeps_the_commit_the_engine_result_names(): void
    {
        $application = $this->application();

        $this->log()->record(
            $application,
            GitOperation::ACTION_PULL,
            fn (): array => ['commit' => ['hash' => 'def456', 'subject' => 'Fix the cart', 'date' => '2026-10-10T10:00:00+02:00']],
        );

        $operation = GitOperation::query()->firstOrFail();
        $this->assertSame('def456', $operation->commit_hash);
        $this->assertSame('Fix the cart', $operation->commit_message);
    }

    public function test_a_recorded_operation_keeps_no_commit_when_the_engine_cannot_read_the_head(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/GitController.php:149 -> GitController::commits (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => Http::response(['message' => 'boom'], 500)]);

        $this->log()->record($application, GitOperation::ACTION_PULL, fn (): array => ['ok' => true]);

        $operation = GitOperation::query()->firstOrFail();
        $this->assertSame(GitOperation::STATUS_SUCCESS, $operation->status);
        $this->assertNull($operation->commit_hash);
    }

    public function test_a_commit_date_the_panel_cannot_parse_leaves_the_time_empty(): void
    {
        $attributes = GitOperation::commitAttributes(['hash' => 'abc', 'subject' => 'x', 'date' => 'not a date']);

        $this->assertSame('abc', $attributes['commit_hash']);
        $this->assertNull($attributes['commit_at']);
    }

    public function test_an_operation_and_a_task_tail_belong_to_their_project(): void
    {
        $application = $this->application();
        $operation = GitOperation::query()->create([
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PULL,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);
        $tail = DeployTaskTail::query()->create(['application_id' => $application->id, 'engine_task_id' => 9, 'source_type' => 'git', 'status' => 'running', 'lines' => '']);

        $this->assertTrue($operation->application->is($application));
        $this->assertTrue($tail->application->is($application));
    }

    public function test_a_task_tail_skips_blank_and_undecodable_lines(): void
    {
        $application = $this->application();
        $tail = DeployTaskTail::query()->create([
            'application_id' => $application->id,
            'engine_task_id' => 9,
            'source_type' => 'git',
            'status' => 'running',
            'lines' => "\n{\"ts\":5,\"stage\":\"build\",\"message\":\"ok\"}\nnot json\n",
        ]);

        $lines = $tail->parsedLines();

        $this->assertCount(1, $lines);
        $this->assertSame(5, $lines[0]['ts']);
    }
}
