<?php

namespace Tests\Feature;

use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * A Client Area upload over `client_max_body_size` is
 * refused by nginx before it reaches PHP, and nginx answered its own HTML 413
 * page. Both front servers (the Client Area on :80 and the Admin Area on :81)
 * must answer a JSON body in the CA's error shape (`{message}`), which is what
 * `Api.getErrorMessages` reads. An upstream 413 (Laravel's
 * PostTooLargeException) is not intercepted and keeps its own JSON.
 *
 * The behaviour is proven against the real image by `check-container-prod.sh`;
 * this class pins the wiring so it cannot be dropped silently (the PHP test
 * image has no nginx).
 *
 * @see src/config/nginx.conf
 * @see src/backend/scripts/check-container-prod.sh
 */
final class NginxErrorResponsesTest extends TestCase
{
    private function nginx(): string
    {
        return (string) file_get_contents(base_path('../config/nginx.conf'));
    }

    public function test_the_front_server_answers_json_413(): void
    {
        $nginx = $this->nginx();

        // One front server: the CA (:80). The Admin Area server (:81) was
        // removed (no v1 admin API behind it). The backend server (:82) is an
        // internal hop and never sees the client body limit itself.
        $this->assertSame(1, substr_count($nginx, 'error_page 413 = @panelalpha_json_413;'));
        $this->assertSame(1, substr_count($nginx, 'location @panelalpha_json_413 {'));
        $this->assertSame(1, substr_count($nginx, 'default_type application/json;'));
        $this->assertSame(1, substr_count($nginx, 'return 413 \'{"message":"The uploaded file is too large."}\';'));
    }

    public function test_the_backend_server_does_not_answer_for_the_client_body_limit(): void
    {
        // :82 binds loopback and only nginx reaches it; the front server has
        // already rejected an over-limit body, so :82 must not carry the page.
        $nginx = $this->nginx();
        $backend = substr($nginx, (int) strpos($nginx, 'listen '.TestNetwork::LOOPBACK.':82 default_server;'));

        $this->assertStringNotContainsString('error_page 413', $backend);
    }
}
