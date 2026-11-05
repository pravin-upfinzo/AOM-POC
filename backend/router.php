<?php
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if($path==='/api/extract.php'){require __DIR__.'/extract.php';return true;}
if($path==='/api/audio.php'){require __DIR__.'/audio.php';return true;}
http_response_code(404);echo 'Not found';
