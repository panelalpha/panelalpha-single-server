<?php

namespace PanelAlpha\Community\Hub;

/**
 * What `hub:claim-install-code` reads from stdin: the Hub code on the first
 * line, the admin's password on the second (optional). Never argv, which `ps`
 * shows to every user of the container. A class of its own so tests can hand
 * the command its input.
 */
class InstallCodeInput
{
    /**
     * @return array{code: string, password: string}
     */
    public function read(): array
    {
        $input = @file_get_contents('php://stdin', length: 4096);
        $lines = preg_split('/\r?\n/', is_string($input) ? $input : '') ?: [];

        return [
            'code' => trim($lines[0] ?? ''),
            // A password is taken as it is: spaces at its ends are part of it.
            'password' => $lines[1] ?? '',
        ];
    }
}
