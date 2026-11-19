<?php

namespace PanelAlpha\ClientArea\Provisioning;

/**
 * Input for creating a new application. Maps 1:1 onto the Engine's flat
 * POST /projects body (`ProjectsApi::create()` rewrites it as the typed body
 * for an Engine that takes it); anything not modelled here can go through
 * $extra, in the flat spelling.
 *
 * template: null = classic PHP hosting (Engine default, used for WordPress),
 * 'dind' = container project. A git_repo always makes a container project.
 */
final readonly class ProvisionRequest
{
    /**
     * @param  array<string, string|null>  $envVars
     * @param  array<string, mixed>  $extra  passed to the Engine unchanged (limits, recipe, stages…)
     * @param  int|null  $serviceId  the hosting service the project joins (never sent to the Engine; Community has one)
     */
    public function __construct(
        public ?string $domain = null,
        public ?string $username = null,
        public ?string $gitRepo = null,
        public ?string $gitBranch = null,
        public ?string $gitToken = null,
        public ?string $template = null,
        public array $envVars = [],
        public array $extra = [],
        public ?int $serviceId = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toEnginePayload(): array
    {
        return array_filter([
            'domain' => $this->domain,
            'username' => $this->username,
            'git_repo' => $this->gitRepo,
            'git_branch' => $this->gitBranch,
            'git_token' => $this->gitToken,
            'template' => $this->template,
            'env_vars' => $this->envVars === [] ? null : $this->envVars,
        ], fn ($value) => $value !== null) + $this->extra;
    }
}
