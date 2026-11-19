<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PanelAlpha\ClientArea\Activity\ActivityActionMap;
use PanelAlpha\ClientArea\Hosting\DomainValidation;
use PanelAlpha\ClientArea\Hosting\SslProbe;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;
use PanelAlpha\ClientArea\Http\Middleware\EnsureApplicationPrivilege;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Support\NoLicenceProjectLimit;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Guards and defaults: what a request without a user, a route without an
 * application or a model without a project gets.
 */
class GuardsAndDefaultsGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_privilege_middleware_refuses_a_request_without_an_application(): void
    {
        $request = Request::create('/x');
        $request->setUserResolver(static fn (): User => User::factory()->create());

        try {
            app(EnsureApplicationPrivilege::class)->handle($request, static fn (): Response => new Response, 'general.delete_instance');
            $this->fail('A route without an application must be refused.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
    }

    public function test_a_controller_helper_refuses_a_request_without_a_user(): void
    {
        $helper = new class
        {
            use ResolvesAuthenticatedUser;

            public function user(Request $request): mixed
            {
                return $this->authenticatedUser($request);
            }
        };

        $this->expectException(AuthenticationException::class);

        $helper->user(Request::create('/x'));
    }

    public function test_there_is_no_licence_limit_on_projects_in_community(): void
    {
        $this->assertNull((new NoLicenceProjectLimit)->limit());
    }

    public function test_a_route_without_a_name_has_no_activity_action(): void
    {
        $this->assertNull(ActivityActionMap::for(null));
    }

    public function test_an_ssl_probe_without_a_host_or_an_address_answers_nothing(): void
    {
        $probe = new SslProbe;

        $this->assertNull($probe->httpsStatus('', 'address'));
        $this->assertNull($probe->httpsStatus('site1.example.com', ''));
    }

    public function test_an_empty_domain_in_the_mirror_does_not_make_a_new_domain_taken(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user);
        Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'nodomain',
            'domain' => '',
            'status' => 'active',
        ]);
        // A name that is empty once `www.` is stripped is skipped too.
        Application::query()->create([
            'engine_id' => 1,
            'engine_username' => 'wwwonly',
            'domain' => 'www.',
            'status' => 'active',
        ]);

        app(DomainValidation::class)->assertAvailable($user, 'fresh.example.org');

        $this->addToAssertionCount(1);
    }

    public function test_a_project_with_details_that_are_not_a_list_is_not_a_container(): void
    {
        $application = $this->syncedApplication(User::factory()->create());
        $application->forceFill(['engine_payload' => ['details' => 'broken']])->save();

        $this->assertFalse($application->fresh()->isContainer());
    }

    public function test_an_activity_entry_and_an_async_status_belong_to_their_project(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $log = ActivityLog::query()->create([
            'action' => 'user.instance.copy',
            'user_id' => $user->id,
            'application_id' => $application->id,
            'request_method' => 'POST',
            'request_uri' => '/api/x',
        ]);
        $status = WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => 'plugin',
            'name' => 'akismet',
            'action' => 'update',
            'status' => 'in_progress',
        ]);

        $this->assertTrue($log->application->is($application));
        $this->assertTrue($status->application->is($application));
    }
}
