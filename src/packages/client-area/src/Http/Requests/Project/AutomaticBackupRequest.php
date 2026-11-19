<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/wordpress/automatic-backup – the old
 * `Requests/User/Instance/Wordpress/AutomaticBackupController::update` rules.
 * The CA sends the old frequency word plus the cron fields in UTC; the service
 * maps them onto the Engine's `backup-schedule`.
 */
final class AutomaticBackupRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'frequency' => ['required', 'string', 'in:never,daily,weekly,monthly,custom'],
            'cron_frequency' => ['nullable', 'string', 'max:255'],
            'cron_hour' => ['nullable', 'integer', 'min:0', 'max:23'],
            'cron_minute' => ['nullable', 'integer', 'min:0', 'max:59'],
            'cron_day_of_month' => ['nullable', 'integer', 'min:1', 'max:31'],
            'cron_day_of_week' => ['nullable', 'integer', 'min:0', 'max:6'],
        ];
    }
}
