<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine's ModSecurity settings: the mode,
 * the rulesets and their config files, and the audit log files.
 */
final class ModsecApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * Engine: ModsecController::getMode → `{data:{mode, enabled_rulesets, …}}`.
     *
     * @return array<string, mixed>
     */
    public function mode(): array
    {
        return Payload::object($this->engine->get('modsec/mode')->json('data'));
    }

    /**
     * @param  string  $mode  on | off | detection_only
     * @return array<string, mixed> the stored config
     */
    public function setMode(string $mode): array
    {
        return Payload::object($this->engine->put('modsec/mode', ['mode' => $mode])->json('data'));
    }

    /**
     * Engine: ModsecRulesetCollection → `{data:[{name, enabled, config_files[]}]}`.
     *
     * @return list<array<string, mixed>>
     */
    public function rulesets(): array
    {
        return Payload::objects($this->engine->get('modsec/rulesets')->json('data'));
    }

    public function enableRuleset(string $name): void
    {
        $name = rawurlencode($name);
        $this->engine->put("modsec/rulesets/{$name}/enable");
    }

    public function disableRuleset(string $name): void
    {
        $name = rawurlencode($name);
        $this->engine->put("modsec/rulesets/{$name}/disable");
    }

    /**
     * Turns config files of a ruleset on and off; answers every ruleset.
     *
     * @param  list<string>  $enable
     * @param  list<string>  $disable
     * @return list<array<string, mixed>>
     */
    public function setConfigFiles(string $name, array $enable, array $disable): array
    {
        $name = rawurlencode($name);

        return Payload::objects($this->engine->put("modsec/rulesets/{$name}/config-files", [
            'enable' => $enable,
            'disable' => $disable,
        ])->json('data'));
    }

    /**
     * Engine: ModsecController::getCustomRules → `{data:{rules, enabled, id_range:[min, max]}}`.
     * An Engine without custom rules answers 404.
     *
     * @return array<string, mixed>
     */
    public function customRules(): array
    {
        return Payload::object($this->engine->get('modsec/custom-rules')->json('data'));
    }

    /**
     * Replaces the custom rule file (empty clears it); answers as
     * {@see customRules()}. The Engine refuses rules its config test rejects
     * with a 422 on `rules`.
     *
     * @return array<string, mixed>
     */
    public function setCustomRules(string $rules): array
    {
        return Payload::object($this->engine->put('modsec/custom-rules', ['rules' => $rules])->json('data'));
    }

    /**
     * Engine: ModsecController::listAuditLogFiles → `{data:[{file, size, mtime}]}`.
     *
     * @return list<array<string, mixed>>
     */
    public function auditLogFiles(): array
    {
        return Payload::objects($this->engine->get('modsec/audit-log/files')->json('data'));
    }

    /**
     * The last entries of an audit log file, each a decoded log record.
     *
     * @return list<array<string, mixed>>
     */
    public function tailAuditLogFile(string $filename): array
    {
        $filename = rawurlencode($filename);

        return Payload::objects($this->engine->get("modsec/audit-log/files/{$filename}/tail")->json('data'));
    }

    /**
     * An audit log file, streamed (Engine `GET modsec/audit-log/files/{f}`):
     * the caller copies the body and its Content-* headers without buffering.
     */
    public function downloadAuditLogFile(string $filename): Response
    {
        $filename = rawurlencode($filename);

        return $this->engine->stream('GET', "modsec/audit-log/files/{$filename}");
    }
}
