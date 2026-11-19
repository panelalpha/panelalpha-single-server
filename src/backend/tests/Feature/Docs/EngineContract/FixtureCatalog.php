<?php

namespace Tests\Feature\Docs\EngineContract;

/**
 * The answers {@see FixtureHarness} builds, each placed on the Engine operation
 * it stands for: the shape the Engine sends for that method, path and status.
 */
final class FixtureCatalog
{
    /**
     * @return list<array{file: string, line: int, method: ?string, path: string, status: int, body: mixed, json: bool}>
     */
    public static function fakes(): array
    {
        $f = new FixtureHarness();
        $entries = [
            ['engineProject', 'GET', '/projects/all', ['data' => [$f->engineProject(10, 'site1')]]],
            ['engineProject', 'GET', '/projects/site1', $f->engineProject(10, 'site1')],
            ['engineDeploy', 'GET', '/projects/site1/deploys', ['data' => [$f->engineDeploy()]]],
            ['engineUsage', 'GET', '/projects/site1/usage', $f->engineUsage()],
            ['engineTunnel', 'GET', '/projects/site1/domains/site1.example.com/tunnels', ['data' => [$f->engineTunnel()]]],
            ['engineTunnel', 'POST', '/projects/site1/domains/site1.example.com/tunnels', $f->engineTunnel(), 201],
            ['engineSslCertificate', 'GET', '/projects/site1/domains/site1.example.com/installed-ssl-cert', $f->engineSslCertificate()],
            ['engineSslCertificate', 'GET', '/projects/site1/domains/installed-ssl-certs', ['data' => [$f->engineSslCertificate()]]],
            ['engineSslCheck', 'GET', '/projects/site1/domains/site1.example.com/ssl-check', ['data' => $f->engineSslCheck()]],
        ];

        $fakes = [];
        foreach ($entries as $entry) {
            $fakes[] = [
                'file' => 'Feature/ClientArea/EngineFixtures.php::'.$entry[0],
                'line' => 0,
                'method' => $entry[1],
                'path' => $entry[2],
                'status' => $entry[4] ?? 200,
                'body' => $entry[3],
                'json' => true,
            ];
        }

        return $fakes;
    }
}
