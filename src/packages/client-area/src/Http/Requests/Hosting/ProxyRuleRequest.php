<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST/PUT /services/{id}/proxy-rules – the old ProxyRuleController rules.
 */
final class ProxyRuleRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'transport' => ['required', 'string', Rule::in(['http', 'tcp', 'udp'])],
            'listen_ip' => ['nullable', 'string'],
            'listen_port' => ['required', 'integer', 'min:1', 'max:65535'],
            'server_name' => ['required', 'string', 'max:255'],
            'username' => ['sometimes', 'nullable', 'string'],
            'upstream_host' => ['required', 'string', 'max:255'],
            'upstream_port' => ['required', 'integer', 'min:1', 'max:65535'],
            'upstream_protocol' => ['nullable', 'string', 'in:http,https'],
            'enabled' => ['sometimes', 'boolean'],
        ];
    }
}
