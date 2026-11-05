<?php
require __DIR__.'/common.php';
if($_SERVER['REQUEST_METHOD']!=='POST')fail('Method not allowed',405);
if(!isset($_FILES['audio'])||$_FILES['audio']['error']!==UPLOAD_ERR_OK)fail('Audio upload failed.');
$f=$_FILES['audio'];if($f['size']<1500)fail('Recording is too short.');if($f['size']>8*1024*1024)fail('Audio exceeds 8 MB.');
$mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$allowed=['audio/webm','video/webm','audio/mp4','video/mp4','audio/ogg','application/ogg'];
if(!in_array($mime,$allowed,true))fail('Unsupported audio format: '.$mime);
$bytes=file_get_contents($f['tmp_name']);if($bytes===false)fail('Cannot read audio.');
$options=json_decode((string)($_POST['allowedOptions']??'{}'),true);if(!is_array($options))$options=[];
send(gemini([['inline_data'=>['mime_type'=>$mime,'data'=>base64_encode($bytes)]]],$options));
