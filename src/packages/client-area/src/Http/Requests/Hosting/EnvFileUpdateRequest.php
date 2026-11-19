<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/{instances|projects}/{instanceId}/env-file – the
 * old EnvFileController update rules: `mode` and `restart` are required and
 * `contents` must be present, possibly empty (the CA always sends all three,
 * `views/instance/advanced/EnvFile.vue` `mutate()`).
 */
final class EnvFileUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'path' => ['required', 'string', 'max:1024'],
            'mode' => ['required', 'string', 'in:kv,raw'],
            'contents' => ['present', 'string', 'max:1048576'],
            'restart' => ['required', 'boolean'],
        ];
    }
}
