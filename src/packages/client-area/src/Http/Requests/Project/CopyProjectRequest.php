<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;

/**
 * POST /projects/{application}/copy – the old CopyInstanceRequest.
 */
final class CopyProjectRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // The old panel required an existing Service id: one of the user's
            // services (U1e; Community has exactly one virtual service).
            'service_id' => ['required', 'integer', Rule::in($this->serviceIds())],
            'user_configurable_options' => ['nullable', 'array'],
            'user_configurable_options.geo_affinity' => ['sometimes', 'string'],
            'user_configurable_options.hosting_plan' => ['sometimes', 'string'],
        ];
    }

    /**
     * @return list<int>
     */
    private function serviceIds(): array
    {
        $user = $this->user();
        if ($user === null) {
            return [];
        }

        return array_map(static fn ($service): int => $service->id, app(ServiceDirectory::class)->forUser($user));
    }
}
