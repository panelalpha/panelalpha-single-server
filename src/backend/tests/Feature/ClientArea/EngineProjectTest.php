<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\ClientArea\Models\Application;
use ReflectionClass;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\TestCase;

/**
 * The Engine client does not know the `Application` model.
 *
 * Contract: every `Engine/Api` method that addresses a project takes an
 * `EngineProject` (the Engine id, the Engine username and the mirrored facts
 * the client checks: `protected`, the main domain); `EngineResolver` answers by
 * Engine id only. The Client Area builds the value with
 * `Application::engineProject()`, and `Application::engine()` still reaches the
 * application's Engine through the resolver. A project the panel does not
 * mirror can be addressed the same way (Admin Area, Multi).
 */
final class EngineProjectTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_project_builds_its_engine_paths(): void
    {
        $project = new EngineProject(1, 'my site');

        $this->assertSame('projects/my%20site', $project->enginePath());
        $this->assertSame('projects/my%20site/wp/plugins', $project->enginePath('wp/plugins'));
        $this->assertSame('projects/my%20site/domains', $project->enginePath('/domains'));
    }

    public function test_the_resolver_knows_engines_only(): void
    {
        $methods = array_map(
            static fn (ReflectionMethod $method): string => $method->getName(),
            (new ReflectionClass(EngineResolver::class))->getMethods(),
        );

        $this->assertSame(['forEngine', 'defaultEngineId', 'engineIds'], $methods);
    }

    public function test_no_api_method_takes_the_application_model(): void
    {
        $projectMethods = 0;
        foreach (glob(base_path('../packages/engine-client/src/Api/*.php')) ?: [] as $file) {
            $class = 'PanelAlpha\\EngineClient\\Api\\'.basename($file, '.php');
            foreach ((new ReflectionClass($class))->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                foreach ($method->getParameters() as $parameter) {
                    $type = $parameter->getType();
                    $name = $type instanceof ReflectionNamedType ? $type->getName() : (string) $type;
                    $this->assertStringNotContainsString(Application::class, $name, "{$class}::{$method->getName()}() takes the Application model.");
                    if ($name === EngineProject::class) {
                        $projectMethods++;
                    }
                }
            }
        }

        // 11 Api classes address a project; a regression to the model must not
        // pass by removing the methods.
        $this->assertGreaterThan(100, $projectMethods);
    }

    public function test_the_mirror_builds_the_engine_project(): void
    {
        $application = new Application([
            'engine_id' => 3,
            'engine_username' => 'site1',
            'domain' => 'site1.example.com',
        ]);
        $application->engine_payload = ['protected' => true];

        $this->assertEquals(new EngineProject(3, 'site1', true, 'site1.example.com'), $application->engineProject());

        // An older Engine without the key, or a malformed value, reads as not
        // protected.
        $application->engine_payload = ['protected' => 'yes'];
        $this->assertFalse($application->engineProject()->protected);
        $application->engine_payload = null;
        $this->assertFalse($application->engineProject()->protected);
    }

    public function test_engine_asks_the_resolver_for_the_applications_engine(): void
    {
        $resolver = new class implements EngineResolver
        {
            /** @var list<int> */
            public array $asked = [];

            public function forEngine(int $engineId): EngineClient
            {
                $this->asked[] = $engineId;

                return new EngineClient(new EngineConnection($engineId, 'https://engine-'.$engineId.'.example.com/api', 'token'));
            }

            public function defaultEngineId(): int
            {
                return 1;
            }

            public function engineIds(): array
            {
                return [1, 7];
            }
        };
        $this->app->instance(EngineResolver::class, $resolver);

        $application = new Application(['engine_id' => 7, 'engine_username' => 'site1']);

        $this->assertSame(7, $application->engine()->connection()->id);
        $this->assertSame([7], $resolver->asked);
    }

    public function test_an_unmirrored_project_reaches_the_api(): void
    {
        $this->configureEngine();
        $engine = app(EngineResolver::class)->forEngine(EngineConnection::DEFAULT_ID);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> DomainCollection
            'engine.example.com/api/projects/other/domains' => Http::response(['data' => [['domain' => 'other.example.com']]]),
            // Engine: core/app/Http/Controllers/User/StagingController.php:253 -> StagingController::push answers 202 with the target UserResource and a task_id
            'engine.example.com/api/projects/other/push' => Http::response(['data' => ['username' => 'target'], 'task_id' => 9], 202),
        ]);

        $domains = (new DomainsApi($engine))->domains(new EngineProject(EngineConnection::DEFAULT_ID, 'other'));
        $this->assertSame([['domain' => 'other.example.com']], $domains);

        // Not a stub: ProjectsApi::push() calls the push the fake above answers.
        // Engine: core/app/Http/Controllers/User/StagingController.php:253 -> StagingController::push
        $push = (new ProjectsApi($engine))->push(
            new EngineProject(EngineConnection::DEFAULT_ID, 'other'),
            new EngineProject(EngineConnection::DEFAULT_ID, 'target'),
        );
        $this->assertSame(9, $push['task_id']);
        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/projects/other/push')
            && $request['target'] === 'target');

        // The pre-check reads the value's own flag, with no mirrored row.
        try {
            (new ProjectsApi($engine))->delete(new EngineProject(EngineConnection::DEFAULT_ID, 'other', protected: true));
            $this->fail('Expected the protected-project refusal.');
        } catch (ProjectProtectedException $e) {
            $this->assertSame('other', $e->username);
        }
        Http::assertNotSent(fn (Request $request): bool => $request->method() === 'DELETE');

        $this->assertDatabaseCount('applications', 0);
    }
}
