<?php
require __DIR__.'/common.php';
if($_SERVER['REQUEST_METHOD']!=='POST')fail('Method not allowed',405);
$body=json_decode(file_get_contents('php://input'),true);
if(!is_array($body))fail('Invalid JSON');
$transcript=trim((string)($body['transcript']??''));if($transcript==='')fail('No speech detected.');
if(mb_strlen($transcript)>5000)fail('Transcript is too long.');
$options=is_array($body['allowedOptions']??null)?$body['allowedOptions']:[];
$result=gemini([['text'=>'User speech transcript: '.$transcript]],$options);
$result['transcript']=$transcript;
send($result);
