<?php

namespace PanelAlpha\EngineClient;

/**
 * One project on one Engine, as the Engine client needs to know it: the Engine
 * it lives on, its Engine username (the {u} in /api/projects/{u}/…) and the
 * facts the client checks before a call – the Engine's `protected` setting
 * and the main domain, whose deletion renames the
 * project.
 *
 * The `Api` methods take this value, not a panel model, so any caller can reach
 * any Engine project, mirrored or not. The Client Area builds it
 * from its mirrored row.
 */
final readonly class EngineProject
{
    public function __construct(
        public int $engineId,
        public string $username,
        public bool $protected = false,
        public ?string $domain = null,
    ) {}

    /**
     * Engine API path of this project, e.g. enginePath('wp/plugins')
     * → "projects/site1/wp/plugins".
     */
    public function enginePath(string $suffix = ''): string
    {
        $path = 'projects/'.rawurlencode($this->username);

        return $suffix === '' ? $path : $path.'/'.ltrim($suffix, '/');
    }
}
