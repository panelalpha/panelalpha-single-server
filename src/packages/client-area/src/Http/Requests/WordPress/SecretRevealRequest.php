<?php

namespace PanelAlpha\ClientArea\Http\Requests\WordPress;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use PanelAlpha\ClientArea\Projects\ProjectSecrets;

/**
 * POST /projects/{application}/secrets/reveal – the one secret to read, from
 * the fixed list of credentials the panel masks.
 */
final class SecretRevealRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'secret' => ['required', 'string', Rule::in(ProjectSecrets::names())],
        ];
    }
}
