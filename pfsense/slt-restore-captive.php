<?php
require_once("/etc/inc/config.inc");
global $config;
$cp = $config['captiveportal']['main_zone'] ?? null;
if ($cp && !empty($cp['page'])) {
    $html = base64_decode($cp['page']);
    if (strpos($html, 'navigator.userAgent') !== false) {
        file_put_contents('/var/etc/captiveportal_main_zone.html', $html);
    }
}
