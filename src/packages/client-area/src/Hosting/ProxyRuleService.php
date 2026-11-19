<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\ProxyRulesApi;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Engine-wide proxy routing, filtered to the user's projects.
 * The Engine serves `E/proxy-rules` over every project, so a client must
 * only ever see and touch rules that belong to its own projects – the old panel
 * leaked all of them; v1 does not.
 */
final class ProxyRuleService
{
    /** Engine develop-2-3-0 `core/app/System/Services/Webserver/ProxyRuleDuplicate.php:14`. */
    private const ENGINE_DUPLICATE_RULE = 'A rule with the same transport, port, and server_name already exists';

    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly AccessResolver $access,
    ) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function list(Authenticatable $user): array
    {
        // The Engine-wide list is read from the default Engine; a rule is owned
        // when the same project exists on that Engine.
        $usernames = $this->usernames($user, $this->defaultEngineId());

        return array_values(array_filter(
            $this->api()->all(),
            fn (array $rule) => $this->owned($rule, $usernames),
        ));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function create(Authenticatable $user, array $params): void
    {
        // The CA no longer sends `username`: the owner is the project whose
        // engine username the rule proxies.
        $owner = trim(Payload::string($params['upstream_host'] ?? ''));
        $application = $this->applicationForUsername($user, $owner, $this->defaultEngineId());
        $this->assertPrivilege($user, $application);
        $this->assertServerName($application, $params['server_name'] ?? null);

        unset($params['username']);

        try {
            $this->api($application)->create($params + ['username' => $owner, 'owner_scope' => 'user']);
        } catch (EngineValidationException $e) {
            throw $this->duplicateRefusal($e, $params) ?? $e;
        }
    }

    /**
     * The Engine refuses a second enabled rule on a name and port another rule
     * holds with its own wording (`ProxyRuleDuplicate::MESSAGE`, which names
     * its fields: "transport, port, and server_name"); the CA shows the
     * address instead and what to do. Any other
     * Engine refusal passes as it is.
     *
     * @param  array<string, mixed>  $params
     */
    private function duplicateRefusal(EngineValidationException $e, array $params): ?ValidationException
    {
        $messages = $e->errors['listen_port'] ?? [];
        if (! in_array(self::ENGINE_DUPLICATE_RULE, $messages, true)) {
            return null;
        }

        $port = Payload::int($params['listen_port'] ?? null) ?? 0;
        $name = trim(Payload::string($params['server_name'] ?? ''));

        return ValidationException::withMessages(['listen_port' => [$name !== ''
            ? "{$name} already has a public URL on port {$port}. Choose another port, or remove that URL first."
            : "Port {$port} is already in use by another rule. Choose another port.",
        ]]);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function update(Authenticatable $user, int $ruleId, array $params): void
    {
        // The rule must be loaded first: a foreign (or unknown) rule id answers
        // 404 before anything is written, so a client can never retarget a rule
        // it does not own.
        $existing = $this->applicationForRule($user, $ruleId);
        $this->assertPrivilege($user, $existing);

        // The Engine PUT cannot move a rule to another owner: it ignores
        // `username` and refuses an `upstream_host` other than the rule's own
        // username (Engine ProxyRuleController.php:242-257,
        // ProxyRuleUpstream.php:16-24). Answer the Engine's own 422 up front
        // instead of a write the Engine would refuse.
        $owner = trim(Payload::string($params['upstream_host'] ?? ''));
        if ($owner !== $existing->engine_username) {
            throw ValidationException::withMessages([
                'upstream_host' => [
                    "The upstream must be the project's own app, '{$existing->engine_username}': a project's rule cannot reach another project, the engine's services or the host.",
                ],
            ]);
        }

        $this->assertServerName($existing, $params['server_name'] ?? null);

        // `server_name` is validated above but the Engine's PUT never accepts
        // it (core/app/Http/Controllers/User/ProxyRuleController.php:236-241),
        // and `transport`/`listen_port` are fixed on update.
        unset($params['server_name'], $params['transport'], $params['listen_port'], $params['listen_ip'], $params['username']);

        $this->api($existing)->update($ruleId, $params);
    }

    /**
     * `server_name` must be one of the derived application's own domains or
     * aliases, exactly – the Engine's rule (`ProxyRuleServerName::namesOf`,
     * develop-2-3-0 05d2365d1): a subdomain of the project is not one of them
     * and the Engine refuses it, so it is refused here with the same field
     * instead of passing the panel's check and failing on the Engine. An IP is
     * refused (old 422).
     */
    private function assertServerName(Application $application, mixed $serverName): void
    {
        if (! is_string($serverName) || trim($serverName) === '') {
            return;
        }

        if (filter_var($serverName, FILTER_VALIDATE_IP)) {
            // Old ProxyRuleController::store text, key `server_name`.
            throw ValidationException::withMessages(['server_name' => ['Select a domain; IP listen addresses are not allowed in Client Area.']]);
        }

        $name = strtolower(trim($serverName));
        $payload = Payload::object($application->engine_payload ?? null);
        $domains = array_merge(
            [Payload::string($application->domain)],
            Payload::strings($payload['domain_names'] ?? []),
        );

        foreach ($domains as $domain) {
            $domain = strtolower($domain);
            if ($domain !== '' && strcasecmp($name, $domain) === 0) {
                return;
            }
        }

        throw ValidationException::withMessages(['server_name' => ['The server name is not a domain of this project.']]);
    }

    public function delete(Authenticatable $user, int $ruleId): void
    {
        $application = $this->applicationForRule($user, $ruleId);
        $this->assertPrivilege($user, $application);

        $this->api($application)->delete($ruleId);
    }

    /**
     * The application a proxy rule belongs to, so the old
     * `hosting.manage_proxy_routing` privilege can be checked on it
     *Only the same Engine that served the rule may own it,
     * matched by `(engine_id, engine_username)`.
     */
    private function applicationForUsername(Authenticatable $user, string $username, int $engineId): Application
    {
        $application = $this->applications->forUser($user)
            ->first(fn (Application $app) => $app->engine_id === $engineId && $app->engine_username === $username);

        abort_if($application === null, 422, 'Unknown project.');

        return $application;
    }

    private function applicationForRule(Authenticatable $user, int $ruleId): Application
    {
        $rule = $this->api()->show($ruleId);
        $username = $rule['username'] ?? null;

        abort_unless(is_string($username) && $username !== '', 404);

        $engineId = $this->defaultEngineId();
        $application = $this->applications->forUser($user)
            ->first(fn (Application $app) => $app->engine_id === $engineId && $app->engine_username === $username);

        abort_if($application === null, 404);

        return $application;
    }

    private function assertPrivilege(Authenticatable $user, Application $application): void
    {
        abort_unless(
            $this->access->allows($user, $application, 'hosting.manage_proxy_routing'),
            403,
            'You do not have permission to perform this action.',
        );
    }

    /**
     * @param  array<string, mixed>  $rule
     * @param  list<string>  $usernames
     */
    private function owned(array $rule, array $usernames): bool
    {
        $username = Payload::nullableString($rule['username'] ?? null);

        return $username !== null && in_array($username, $usernames, true);
    }

    /**
     * @return list<string>
     */
    private function usernames(Authenticatable $user, int $engineId): array
    {
        /** @var list<string> $usernames */
        $usernames = collect($this->applications->forUser($user))
            ->filter(fn (Application $app) => $app->engine_id === $engineId)
            ->map(fn (Application $app) => $app->engine_username)
            ->values()
            ->all();

        return $usernames;
    }

    /**
     * The Engine client for a proxy-rule call. When the rule's application is
     * known, use **its** Engine; the Engine-wide list uses the default one.
     */
    private function api(?Application $application = null): ProxyRulesApi
    {
        return new ProxyRulesApi(
            $application?->engine()
            ?? app(EngineResolver::class)->forEngine($this->defaultEngineId()),
        );
    }

    private function defaultEngineId(): int
    {
        return app(EngineResolver::class)->defaultEngineId();
    }
}
