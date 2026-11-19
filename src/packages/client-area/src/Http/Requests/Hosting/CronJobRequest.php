<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/cron-jobs and PUT .../{line} – the old
 * CronJobStoreRequest. Each schedule field is a single-line cron expression
 * fragment (the Engine validates the grammar).
 *
 * `service` is new: on a container project the Engine 2.3.0 runs a job
 * in one Compose service and requires its name; on PHP hosting it refuses one.
 * The panel checks only the name's shape and leaves that choice to the Engine
 * (`ValidatesCronJobFields`), so a project's kind is never decided twice.
 */
final class CronJobRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $oneLine = ['required', 'string', 'not_regex:/[\r\n\x00]/', 'max:255'];

        return [
            'command' => ['required', 'string', 'not_regex:/[\r\n\x00]/'],
            // Engine `ContainerOperations::SERVICE_NAME`.
            'service' => ['nullable', 'string', 'max:63', 'regex:/^[a-zA-Z0-9_][a-zA-Z0-9_-]*\z/'],
            'minute' => $oneLine,
            'hour' => $oneLine,
            'day_of_month' => $oneLine,
            'month' => $oneLine,
            'day_of_week' => $oneLine,
        ];
    }
}
