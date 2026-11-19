<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeployService;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * DeployService input checks and clean-up the route tests do not reach: a git
 * retry, a redeploy without its source input, a staging that does not exist,
 * archive names and the staged archives a refused deploy deletes.
 */
class DeployServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const DIR = 'project/.panelalpha-upload';

    private function service(): DeployService
    {
        return app(DeployService::class);
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function application(array $details = ['template' => 'dind']): Application
    {
        // The list of a project with a recorded outcome reads its newest deploy.
        $this->fakeEngineDeploys('site1');
        $application = $this->syncedApplication(User::factory()->create(), 'site1', ['details' => $details]);

        return $application;
    }

    public function test_a_failed_git_install_is_retried_with_a_pull_of_the_checkout(): void
    {
        Queue::fake();
        $application = $this->application(['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']);

        // Engine: core/app/Http/Controllers/User/GitController.php:340 -> GitController::pull (202 + Task)
        Http::fake(['engine.example.com/api/projects/site1/git/pull' => Http::response(['data' => ['id' => 44]], 202)]);

        $this->service()->retryInstall($application);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && str_ends_with($request->url(), '/git/pull'));
    }

    public function test_an_archive_install_is_rebuilt_for_the_admin_area(): void
    {
        Queue::fake();
        $application = $this->application(['template' => 'dind', 'deployment_status' => 'failed']);

        // Engine: core/app/Http/Controllers/UserController.php:750 -> UserController::rebuild (202 + Task)
        Http::fake(['engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 45]], 202)]);

        // Only the Client Area's route asks for the archive.
        $this->service()->retryInstall($application);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && str_ends_with($request->url(), '/projects/site1/rebuild'));
    }

    public function test_the_client_areas_git_retry_without_a_checkout_deploys_from_the_repository(): void
    {
        Queue::fake();
        $application = $this->application(['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']);

        // A first deploy that failed before a checkout existed.
        Http::fake([
            // Engine: core/app/Lib/Git/GitActions.php:250 -> the 422 under `git`
            'engine.example.com/api/projects/site1/git/pull' => Http::response([
                'message' => 'No git repository at path',
                'errors' => ['git' => ['No git repository at path']],
            ], 422),
            // Engine: core/app/Lib/Project/ProjectRebuild.php:338 -> ATTACH_SOURCE / REBUILD
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 45]], 202),
        ]);

        $this->service()->retryInstall($application, clientAreaRetry: true);

        Http::assertSent(fn ($request): bool => $request->method() === 'POST' && str_ends_with($request->url(), '/projects/site1/rebuild'));
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id
            && $job->finishedType === 'user.instance.installation_finished'
            && $job->failedType === 'user.instance.installation_failed');
    }

    public function test_the_client_areas_git_retry_keeps_a_pull_the_engine_refused_for_another_reason(): void
    {
        Queue::fake();
        $application = $this->application(['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']);

        // A checkout that refuses the pull keeps that refusal.
        Http::fake([
            // Engine: core/app/Lib/Git/GitActions.php:250 -> the 422 under `git`
            'engine.example.com/api/projects/site1/git/pull' => Http::response([
                'message' => 'Pull first.',
                'errors' => ['git' => ['Pull first.']],
            ], 422),
            // Engine: core/app/Lib/Project/ProjectRebuild.php:338 -> ATTACH_SOURCE / REBUILD
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 45]], 202),
        ]);

        try {
            $this->service()->retryInstall($application, clientAreaRetry: true);
            $this->fail('A pull the Engine refused is not replaced by a rebuild.');
        } catch (EngineValidationException $e) {
            $this->assertSame('Pull first.', $e->getMessage());
        }

        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/rebuild'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_the_admin_areas_git_retry_keeps_the_engines_missing_checkout_refusal(): void
    {
        Queue::fake();
        $application = $this->application(['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']);

        Http::fake([
            // Engine: core/app/Lib/Git/GitActions.php:250 -> the 422 under `git`
            'engine.example.com/api/projects/site1/git/pull' => Http::response([
                'message' => 'No git repository at path',
                'errors' => ['git' => ['No git repository at path']],
            ], 422),
            // Engine: core/app/Lib/Project/ProjectRebuild.php:338 -> ATTACH_SOURCE / REBUILD
            'engine.example.com/api/projects/site1/rebuild' => Http::response(['data' => ['id' => 45]], 202),
        ]);

        try {
            $this->service()->retryInstall($application);
            $this->fail('The Admin Area\'s retry is master\'s pull, whose refusal bubbles.');
        } catch (EngineValidationException $e) {
            $this->assertSame('No git repository at path', $e->getMessage());
        }

        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/rebuild'));
        Queue::assertNotPushed(WatchDeployJob::class);
    }

    public function test_a_git_redeploy_without_a_branch_is_refused(): void
    {
        $application = $this->application(['template' => 'dind', 'git_repo' => 'https://github.com/acme/site']);

        try {
            $this->service()->redeploy($application, []);
            $this->fail('A git redeploy needs a branch.');
        } catch (ValidationException $e) {
            $this->assertSame(['A branch is required to redeploy from git.'], $e->errors()['branch']);
        }
    }

    public function test_a_files_redeploy_without_an_archive_is_refused(): void
    {
        $application = $this->application();

        try {
            $this->service()->redeploy($application, ['remote_filepath' => '  ']);
            $this->fail('A files redeploy needs an archive.');
        } catch (ValidationException $e) {
            $this->assertSame(['An uploaded archive path is required to redeploy from files.'], $e->errors()['remote_filepath']);
        }
    }

    public function test_a_redeploy_of_a_staging_that_does_not_exist_is_refused(): void
    {
        $application = $this->application();

        try {
            $this->service()->redeploy($application, ['deploy_staging' => true, 'remote_filepath' => self::DIR.'/site.zip']);
            $this->fail('A project without a staging has nothing to deploy to.');
        } catch (ValidationException $e) {
            $this->assertSame(['There is no staging project to deploy to.'], $e->errors()['deploy_staging']);
        }
    }

    /**
     * @return array<string, array{string}>
     */
    public static function badArchiveNameProvider(): array
    {
        return [
            'parent directory' => ['..'],
            'a name with two dots in it' => ['a..b.zip'],
            'nothing' => [''],
        ];
    }

    #[DataProvider('badArchiveNameProvider')]
    public function test_an_upload_with_an_unusable_archive_name_is_refused(string $filename): void
    {
        $application = $this->application();

        try {
            $this->service()->uploadArchive($application, ['filename' => $filename], 'bytes');
            $this->fail('An unusable archive name must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Only .zip and .tar.gz archives are supported.'], $e->errors()['filename']);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/files/'));
    }

    public function test_a_refused_deploy_on_a_classic_project_deletes_nothing(): void
    {
        $application = $this->application([]);

        $this->service()->discardRefusedArchive($application, self::DIR.'/site.zip');

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/files/remove'));
    }

    public function test_a_refused_deploy_deletes_only_the_archives_inside_the_upload_folder(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:97 -> files/remove
        Http::fake(['engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true])]);

        $this->service()->discardRefusedArchive($application, [
            42,
            '',
            self::DIR.'/../../.env',
            self::DIR."/a\0.zip",
            'project/other/site.zip',
            self::DIR.'/site.zip',
            self::DIR.'/site.zip',
        ]);

        Http::assertSentCount(1);
        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE' && $request['path'] === self::DIR.'/site.zip');
    }
}
