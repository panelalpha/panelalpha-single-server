<?php

namespace Tests\Feature\ClientArea\Git;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Git\ProviderTarget;
use PanelAlpha\ClientArea\Git\Providers\AbstractProvider;
use PanelAlpha\ClientArea\Git\Providers\BitbucketProvider;
use PanelAlpha\ClientArea\Git\Providers\GithubProvider;
use PanelAlpha\ClientArea\Git\Providers\GitlabProvider;
use PanelAlpha\ClientArea\Git\Providers\GitProvider;
use PanelAlpha\ClientArea\Git\Providers\ProviderFactory;
use PanelAlpha\ClientArea\Git\Providers\TokenRefusedException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The provider webhook clients the panel uses for auto-deploy,
 * ported from the old `App\Lib\Apis\{Github,Gitlab,Bitbucket}`. The requests are
 * asserted against the providers' documented APIs; no real call is made. The
 * panel registers the provider webhook itself; the Engine does not.
 * @see packages/api/app/Lib/Apis/{Github,Gitlab,Bitbucket}.php (old provider clients)
 */
class GitProvidersTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * The Engine's deploy-hook secret format: 48 hex chars
     * (core/app/Models/DeployHook.php:50-53 `bin2hex(random_bytes(24))`).
     */
    private const HOOK_SECRET = '9f2c1a7b4e6d8035a1b2c3d4e5f60718293a4b5c6d7e8f90';

    public function test_provider_target_detection(): void
    {
        $github = ProviderTarget::fromUrl('https://github.com/acme/site.git');
        $this->assertSame('github', $github?->provider);
        $this->assertSame('https://api.github.com', $github?->apiBase);
        $this->assertSame('acme', $github?->owner);
        $this->assertSame('site', $github?->repo);

        $gitlab = ProviderTarget::fromUrl('https://gitlab.example.com/group/sub/site');
        $this->assertSame('gitlab', $gitlab?->provider);
        $this->assertSame('https://gitlab.example.com/api/v4', $gitlab?->apiBase);
        $this->assertSame('group/sub/site', $gitlab?->projectPath);

        $bitbucket = ProviderTarget::fromUrl('https://bitbucket.org/acme/site');
        $this->assertSame('bitbucket', $bitbucket?->provider);
        $this->assertSame('https://api.bitbucket.org/2.0', $bitbucket?->apiBase);

        $this->assertNull(ProviderTarget::fromUrl('https://github.com/only-one-segment'));
    }

    public function test_github_registers_the_webhook(): void
    {
        $provider = new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_token', [TestNetwork::routable(34)]);

        // External: https://docs.github.com/en/rest/repos/webhooks (create a repository webhook)
        Http::fake(['api.github.com/*' => Http::response(['id' => 123])]);

        $this->assertSame('123', $provider->registerWebhook('https://engine.test/hooks/abc', self::HOOK_SECRET, 'main', true));

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks'
            && $r->hasHeader('Authorization', 'Bearer ghp_token')
            && $r['config']['secret'] === self::HOOK_SECRET
            && $r['config']['insecure_ssl'] === '1');
    }

    public function test_github_deletes_the_webhook(): void
    {
        $provider = new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_token', [TestNetwork::routable(34)]);

        // External: https://docs.github.com/en/rest/repos/webhooks (delete a repository webhook)
        Http::fake(['api.github.com/*' => Http::response(null, 204)]);

        $provider->deleteWebhook('123');

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.github.com/repos/acme/site/hooks/123'
            && $r->hasHeader('Authorization', 'Bearer ghp_token'));
    }

    public function test_github_verifies_ssl_when_the_certificate_is_valid(): void
    {
        $provider = new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_token', [TestNetwork::routable(34)]);

        // External: https://docs.github.com/en/rest/repos/webhooks (create a repository webhook)
        Http::fake(['api.github.com/*' => Http::response(['id' => 1])]);

        $provider->registerWebhook('https://engine.test/hooks/abc', self::HOOK_SECRET, null, false);

        Http::assertSent(fn ($r) => $r['config']['insecure_ssl'] === '0');
    }

    public function test_gitlab_registers_the_hook(): void
    {
        $provider = new GitlabProvider(ProviderTarget::fromUrl('https://gitlab.example.com/acme/site'), 'glpat', [TestNetwork::routable(34)]);

        // External: https://docs.gitlab.com/ee/api/projects.html#add-project-hook
        Http::fake(['gitlab.example.com/*' => Http::response(['id' => 9])]);

        // The Engine verifies `X-Gitlab-Token`, i.e. the hook's `token` field
        // (Engine core/app/Lib/DeployHook/GitlabProvider.php:38-47).
        $this->assertSame('9', $provider->registerWebhook('https://engine.test/hooks/abc', self::HOOK_SECRET, 'main', false));

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && str_contains($r->url(), '/api/v4/projects/acme%2Fsite/hooks')
            && $r->hasHeader('Authorization', 'Bearer glpat')
            && $r['token'] === self::HOOK_SECRET
            && ! isset($r['signing_token'])
            && $r['push_events'] === true
            && $r['push_events_branch_filter'] === 'main'
            && $r['enable_ssl_verification'] === true);
    }

    public function test_gitlab_accepts_the_engine_hook_secret_format(): void
    {
        $provider = new GitlabProvider(ProviderTarget::fromUrl('https://gitlab.example.com/acme/site'), 'glpat', [TestNetwork::routable(34)]);

        // External: https://docs.gitlab.com/ee/api/projects.html#add-project-hook
        Http::fake(['gitlab.example.com/*' => Http::response(['id' => 9])]);

        // 48 hex chars, no prefix check.
        $this->assertMatchesRegularExpression('/^[0-9a-f]{48}$/', self::HOOK_SECRET);
        $provider->registerWebhook('https://engine.test/hooks/abc', self::HOOK_SECRET, null, false);

        Http::assertSent(fn ($r) => $r['token'] === self::HOOK_SECRET);
    }

    public function test_gitlab_deletes_the_webhook(): void
    {
        $provider = new GitlabProvider(ProviderTarget::fromUrl('https://gitlab.example.com/acme/site'), 'glpat', [TestNetwork::routable(34)]);

        // External: https://docs.gitlab.com/ee/api/projects.html#delete-project-hook
        Http::fake(['gitlab.example.com/*' => Http::response(null, 204)]);

        $provider->deleteWebhook('77');

        // Engine side verifies `X-Gitlab-Token`; the panel's own call carries the
        // provider token as a bearer header.
        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://gitlab.example.com/api/v4/projects/acme%2Fsite/hooks/77'
            && $r->hasHeader('Authorization', 'Bearer glpat'));
    }

    /** Each provider answers 401 to a repository read with a token it does not have. */
    public function test_each_provider_reads_the_repository_with_the_token(): void
    {
        // External: https://docs.github.com/en/rest/repos/repos#get-a-repository
        Http::fake(['api.github.com/*' => Http::response(['full_name' => 'acme/site'])]);
        (new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_token', [TestNetwork::routable(34)]))->checkToken();
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && $r->url() === 'https://api.github.com/repos/acme/site'
            && $r->hasHeader('Authorization', 'Bearer ghp_token')
            && $r->hasHeader('X-GitHub-Api-Version'));

        // External: https://docs.gitlab.com/ee/api/projects.html#get-single-project
        Http::fake(['gitlab.example.com/*' => Http::response(['path_with_namespace' => 'acme/site'])]);
        (new GitlabProvider(ProviderTarget::fromUrl('https://gitlab.example.com/acme/site'), 'glpat', [TestNetwork::routable(34)]))->checkToken();
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && $r->url() === 'https://gitlab.example.com/api/v4/projects/acme%2Fsite'
            && $r->hasHeader('Authorization', 'Bearer glpat'));

        // External: https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-get
        Http::fake(['api.bitbucket.org/*' => Http::response(['full_name' => 'acme/site'])]);
        (new BitbucketProvider(ProviderTarget::fromUrl('https://bitbucket.org/acme/site'), 'bb_token', [TestNetwork::routable(34)]))->checkToken();
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && $r->url() === 'https://api.bitbucket.org/2.0/repositories/acme/site'
            && $r->hasHeader('Authorization', 'Bearer bb_token'));
    }

    public function test_a_provider_401_refuses_the_token(): void
    {
        $provider = new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_typo', [TestNetwork::routable(34)]);

        // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (401 Bad credentials)
        Http::fake(['api.github.com/*' => Http::response(['message' => 'Bad credentials'], 401)]);

        $this->expectException(TokenRefusedException::class);
        $provider->checkToken();
    }

    /** Only the provider's 401 refuses the credential: a 404, a rate limit and an outage do not. */
    #[DataProvider('providerAnswersThatAreNotRefusals')]
    public function test_only_a_401_is_a_refused_token(int $status): void
    {
        $provider = new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_typo', [TestNetwork::routable(34)]);

        // External: https://docs.github.com/en/rest/repos/repos#get-a-repository (404, 403 and 500 answers)
        Http::fake(['api.github.com/*' => Http::response([], $status)]);

        $provider->checkToken();

        $this->addToAssertionCount(1);
    }

    /** @return array<string, array{int}> */
    public static function providerAnswersThatAreNotRefusals(): array
    {
        return ['a repository the token cannot see' => [404], 'a rate limit' => [403], 'an outage' => [500]];
    }

    public function test_bitbucket_registers_the_hook(): void
    {
        $provider = new BitbucketProvider(ProviderTarget::fromUrl('https://bitbucket.org/acme/site'), 'bb_token', [TestNetwork::routable(34)]);

        // External: https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-hooks-post
        Http::fake(['api.bitbucket.org/*' => Http::response(['uuid' => '{deadbeef}'])]);

        $this->assertSame('{deadbeef}', $provider->registerWebhook('https://engine.test/hooks/abc', self::HOOK_SECRET, null, false));

        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://api.bitbucket.org/2.0/repositories/acme/site/hooks'
            && $r['secret'] === self::HOOK_SECRET
            && $r['events'] === ['repo:push']);
    }

    public function test_bitbucket_deletes_the_hook(): void
    {
        $provider = new BitbucketProvider(ProviderTarget::fromUrl('https://bitbucket.org/acme/site'), 'bb_token', [TestNetwork::routable(34)]);

        // External: https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-hooks-hook-uid-delete
        Http::fake(['api.bitbucket.org/*' => Http::response(null, 204)]);

        $provider->deleteWebhook('{deadbeef}');

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && $r->url() === 'https://api.bitbucket.org/2.0/repositories/acme/site/hooks/deadbeef'
            && $r->hasHeader('Authorization', 'Bearer bb_token'));
    }

    public function test_provider_clients_disable_redirects_and_pin_the_validated_address(): void
    {
        // No redirects, the validated IP
        // pinned via curl's CURLOPT_RESOLVE, timeout 30 s.
        $provider = new GitlabProvider(
            ProviderTarget::fromUrl('https://gitlab.example.com/acme/site'),
            'glpat',
            [TestNetwork::routable(34), '2606:4700:4700::1111'],
        );

        $options = $provider->client()->getOptions();
        $this->assertSame(30, $options['timeout']);
        $this->assertFalse($options['allow_redirects']);
        // An IPv6 address is bracketed, as curl requires; both validated
        // addresses are offered so curl can fall back inside the list.
        $this->assertSame(
            ['gitlab.example.com:443:'.TestNetwork::routable(34).',[2606:4700:4700::1111]'],
            $options['curl'][CURLOPT_RESOLVE],
        );

        // A client without a validated address is invalid, never unpinned.
        $this->expectException(\InvalidArgumentException::class);
        new GithubProvider(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_token', []);
    }

    public function test_provider_tokens_and_secrets_are_sensitive_parameters(): void
    {
        // Never in a stack trace.
        $constructor = new \ReflectionMethod(AbstractProvider::class, '__construct');
        $this->assertNotEmpty($constructor->getParameters()[1]->getAttributes(\SensitiveParameter::class));

        foreach (['registerWebhook'] as $method) {
            $secret = null;
            foreach ((new \ReflectionMethod(GitProvider::class, $method))->getParameters() as $parameter) {
                if ($parameter->getName() === 'secret') {
                    $secret = $parameter;
                }
            }
            $this->assertNotNull($secret, "GitProvider::{$method}() takes no secret.");
            $this->assertNotEmpty($secret->getAttributes(\SensitiveParameter::class));
        }

        $factory = new \ReflectionMethod(ProviderFactory::class, 'for');
        $this->assertNotEmpty($factory->getParameters()[1]->getAttributes(\SensitiveParameter::class));
    }

    public function test_the_factory_guards_and_pins_the_api_host_not_the_repository_host(): void
    {
        $hosts = new class implements HostGuard
        {
            /** @var list<string> */
            public array $resolved = [];

            public function assertAllowed(string $host): void
            {
                $this->resolved[] = $host;
            }

            public function allows(string $host): bool
            {
                return true;
            }

            public function validatedAddresses(string $host): array
            {
                $this->resolved[] = $host;

                return [TestNetwork::routable(34)];
            }
        };

        $provider = (new ProviderFactory($hosts))->for(ProviderTarget::fromUrl('https://github.com/acme/site'), 'ghp_token');

        // api.github.com, not github.com: the request goes to the API host.
        $this->assertSame(['api.github.com'], $hosts->resolved);
        $this->assertSame(
            ['api.github.com:443:'.TestNetwork::routable(34)],
            $provider->client()->getOptions()['curl'][CURLOPT_RESOLVE],
        );

        // A blocked host never reaches the client.
        $blocked = new class implements HostGuard
        {
            public function assertAllowed(string $host): void {}

            public function allows(string $host): bool
            {
                return false;
            }

            public function validatedAddresses(string $host): array
            {
                throw ValidationException::withMessages(['host' => ['blocked']]);
            }
        };

        $this->expectException(ValidationException::class);
        (new ProviderFactory($blocked))->for(ProviderTarget::fromUrl('https://gitlab.internal/acme/site'), 'glpat');
    }
}
