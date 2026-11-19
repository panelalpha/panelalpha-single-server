<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Facades\Storage;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Website screenshot: the CA embeds
 * `/instances/{id}/screenshot.jpg` in project cards, and can refresh it.
 *
 * The old panel ran Google PageSpeed and cached the final screenshot on its own
 * disk. v1 asks the Engine's Lighthouse endpoint instead (POST
 * /lighthouse/generate-report) and stores the data: URI it returns on the panel
 * disk; the timestamp is panel-owned.
 */
final class ScreenshotService
{
    /**
     * Refresh the stored thumbnail and record the timestamp. Returns false when
     * the Engine could not produce a report (unreachable URL, Lighthouse down) –
     * the caller surfaces it as a 422 the way the old controller did.
     */
    public function refresh(Application $application): bool
    {
        try {
            $report = (new ProjectsApi($application->engine()))
                ->lighthouseReport($application->url(), desktop: true, summary: false);
        } catch (EngineException $e) {
            report($e);

            return false;
        }

        $screenshot = $this->finalScreenshot($report);
        if ($screenshot === null) {
            return false;
        }

        $disk = Storage::disk($this->disk());
        $disk->put($this->pngPath($application), $screenshot);
        $disk->put($this->jpgPath($application), $this->toBinary($screenshot));

        $application->forceFill(['screenshot_time' => now()->timestamp])->save();

        return true;
    }

    /**
     * The stored JPG bytes, or null when none exists yet.
     */
    public function jpg(Application $application): ?string
    {
        $disk = Storage::disk($this->disk());
        $path = $this->jpgPath($application);

        return $disk->exists($path) ? $disk->get($path) : null;
    }

    /**
     * The Lighthouse final-screenshot data URI (`data:image/...;base64,...`).
     *
     * @param  array<string, mixed>  $report  Lighthouse result
     */
    private function finalScreenshot(array $report): ?string
    {
        $audits = Payload::object($report['audits'] ?? null);
        $final = Payload::object($audits['final-screenshot'] ?? null);
        $details = Payload::object($final['details'] ?? null);
        $data = Payload::nullableString($details['data'] ?? null);

        return $data !== null && str_starts_with($data, 'data:') ? $data : null;
    }

    private function toBinary(string $dataUri): string
    {
        $comma = strpos($dataUri, ',');

        return $comma === false ? '' : (string) base64_decode(substr($dataUri, $comma + 1), true);
    }

    private function pngPath(Application $application): string
    {
        return 'screenshots/'.$application->id;
    }

    private function jpgPath(Application $application): string
    {
        return 'screenshots/'.$application->id.'.jpg';
    }

    private function disk(): string
    {
        // A private disk, served through the authorised route.
        return Payload::string(config('client-area.screenshot_disk', 'local'));
    }
}
