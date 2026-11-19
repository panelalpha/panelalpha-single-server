<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/domains/{domain}/php-version.
 */
final class PhpVersionRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'php_version' => ['required', 'string', 'max:16'],
        ];
    }
}
