<?php

/*
 * The Composer vendor directory this process loads. `vendor` is the product
 * `composer.json` installs; another product can be installed next to it from
 * its own Composer file into the directory `COMPOSER_VENDOR_DIR` names.
 * Laravel's package discovery already follows `COMPOSER_VENDOR_DIR`
 * (`PackageManifest`); the two cached manifests get their own file per vendor
 * directory, so the installs never overwrite each other's provider list. The
 * images install a single product into `vendor` and never set the variable.
 *
 * Returns the absolute vendor directory.
 */

$vendorDirectory = getenv('COMPOSER_VENDOR_DIR');
if (! is_string($vendorDirectory) || $vendorDirectory === '' || $vendorDirectory === 'vendor') {
    return dirname(__DIR__).'/vendor';
}

if (! str_starts_with($vendorDirectory, '/')) {
    $vendorDirectory = dirname(__DIR__).'/'.$vendorDirectory;
}

foreach (['APP_PACKAGES_CACHE' => 'packages', 'APP_SERVICES_CACHE' => 'services'] as $cacheVariable => $cacheName) {
    if (getenv($cacheVariable) === false) {
        $cachePath = 'bootstrap/cache/'.$cacheName.'-'.basename($vendorDirectory).'.php';
        putenv($cacheVariable.'='.$cachePath);
        $_ENV[$cacheVariable] = $_SERVER[$cacheVariable] = $cachePath;
    }
}

return $vendorDirectory;
