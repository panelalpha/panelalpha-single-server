<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects/{application}/webserver-logs/{filename} – the paged read of
 * client-area-next (`page`, and `size`, the file size page 1 answered). Without
 * `page` the route answers the old `{data: string}` tail; the old Client Area
 * sends no query (`fetchData.js:42`).
 */
final class LogPageRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'page' => ['nullable', 'integer', 'min:1'],
            'size' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
