<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /server-accounts/{id}/{instances|projects}/{instanceId}/env-file – the
 * old EnvFileController show rules. The PUT rules live in EnvFileUpdateRequest.
 */
final class EnvFileRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'path' => ['required', 'string', 'max:1024'],
        ];
    }
}
