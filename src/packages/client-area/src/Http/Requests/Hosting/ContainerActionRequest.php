<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Container project action – the CA sends `{action}` (section O). The old
 * `down` (compose down: stop and remove every container) is not offered any
 * more, so it is refused here too.
 */
final class ContainerActionRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'action' => ['required', 'string', 'in:up,stop,restart,pull'],
        ];
    }
}
