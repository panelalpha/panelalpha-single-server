<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /services/{id}/proxy-rules/{ruleId} – only the upstream target and the
 * enabled flag can change (the old ProxyRuleController update).
 */
final class ProxyRuleUpdateRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'upstream_host' => ['required', 'string', 'max:255'],
            'upstream_port' => ['required', 'integer', 'min:1', 'max:65535'],
            'upstream_protocol' => ['nullable', 'string', 'in:http,https'],
            'enabled' => ['sometimes', 'boolean'],
            // Part of the update contract so the panel validates it against the
            // derived application (the CA does not send it on edit; a client
            // that does gets the same 422 as on create). The Engine's PUT does
            // not accept it, so the service never forwards it.
            'server_name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
