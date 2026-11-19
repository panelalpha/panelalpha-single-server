<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Who a project belongs to and who it is shared with, as the project payload
 * reports it (old `InstanceResource` `owned`, `owner`, `shared_access`,
 * packages/api/app/Http/Resources/InstanceResource.php:68,83-87,144-146; review
 * 47 S6). The Client Area's share dialog lists `shared_access`
 * (`apis/Instances.js:122`, `components/modal/ShareInstanceModal.vue`).
 *
 * The controller's default
 * ({@see \PanelAlpha\ClientArea\Access\SingleUserProjectSharing})
 * is the single-user answer – the user owns every project, which is shared with
 * nobody; an edition with shared access binds its own.
 */
interface ProjectSharing
{
    /**
     * @return array{owned: bool, owner: array{name: string|null, email: string|null}|null, shared_access: list<array<string, mixed>>}
     */
    public function describe(Application $application, Authenticatable $user): array;
}
