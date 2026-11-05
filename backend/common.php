<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('max_execution_time', '90');
error_reporting(E_ALL);

function loadEnvironmentFile(string $path): void
{
    if (!is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);

        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) || getenv($name) !== false) {
            continue;
        }

        $value = trim($value);
        $quote = $value[0] ?? '';

        if (($quote === '"' || $quote === "'") && str_ends_with($value, $quote)) {
            $value = substr($value, 1, -1);
        }

        putenv($name . '=' . $value);
    }
}

loadEnvironmentFile(__DIR__ . '/.env');

function fail(string $message, int $code = 400): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'error' => $message
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

function send(array $data): never
{
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

function gemini(array $parts, array $options): array
{
    // 1. Gemini API configuration
    $key = getenv('GEMINI_API_KEY');

    if (!$key) {
        fail(
            'GEMINI_API_KEY is missing. Configure it on the PHP server.',
            503
        );
    }

    $model = getenv('GEMINI_MODEL') ?: 'gemini-3.5-flash-lite';

    // 2. Allowed form fields
    $allowedFields = [
        'entityName',
        'entityType',
        'tsp',
        'services',
        'bankName',
        'branchName',
        'assignedBy',
        'date'
    ];

    // 3. AI extraction instructions
    $prompt = <<<PROMPT
You are an AI assistant for a fintech account-opening
request management application.

Your task is to extract form field values from
the user's speech transcript.

Return ONLY valid JSON in this structure:

{
  "transcript": "",
  "fields": {}
}

ALLOWED FIELD KEYS:
- entityName
- entityType
- tsp
- services
- bankName
- branchName
- assignedBy
- date

EXTRACTION RULES:

1. Extract only information explicitly spoken.

2. Never invent or assume missing information.

3. If a spoken value is unclear, incomplete, or
   cannot be confidently matched, omit that field.

4. Never guess a value based on similar-sounding words.

5. Do not infer values from previously filled form data.

6. Multiple fields may be extracted from one transcript.

7. For corrections within the same transcript,
   use the latest explicitly stated value.

8. For dropdown fields, match only values provided
   in allowedOptions. Return the exact allowed value.

9. If a dropdown value does not match an allowed
   option confidently, omit that field.

10. If both bankName and branchName are provided,
    ensure the branch belongs to the selected bank
    according to allowedOptions.

11. Convert explicit, unambiguous dates to YYYY-MM-DD.

12. If the date is ambiguous, omit it.

13. Never interpret unrelated numbers as dates.

14. If speech is empty, silent, or meaningless,
    return an empty fields object.

15. Preserve entity names accurately.

16. Do not invent an entity name from the speaker's
    name unless explicitly identified as the entity.

17. Output JSON only, without markdown or explanations.

18. Return the supplied speech transcript unchanged
    in the transcript property.
PROMPT;

    // 4. Include dropdown options
    $prompt .= "\n\nallowedOptions:\n";

    $prompt .= json_encode(
        $options,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    // 5. Gemini request payload
    $payload = [
        'contents' => [
            [
                'parts' => array_merge(
                    [['text' => $prompt]],
                    $parts
                )
            ]
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'temperature' => 0
        ]
    ];

    $jsonPayload = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    if ($jsonPayload === false) {
        fail('Unable to prepare Gemini request.', 500);
    }

    // 6. Gemini API endpoint
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        . rawurlencode($model)
        . ':generateContent';

    $ch = curl_init($url);

    if ($ch === false) {
        fail('Unable to initialize Gemini connection.', 500);
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $key
        ],
        CURLOPT_POSTFIELDS => $jsonPayload,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 45
    ]);

    // 7. Execute API request
    $raw = curl_exec($ch);

    $http = (int) curl_getinfo(
        $ch,
        CURLINFO_HTTP_CODE
    );

    $curlError = curl_error($ch);

    // No curl_close() - deprecated in PHP 8.5

    if ($raw === false) {
        error_log('Gemini connection error: ' . $curlError);

        fail(
            'Unable to connect to Gemini. Please try again.',
            502
        );
    }

    // 8. Decode Gemini API response
    $response = json_decode($raw, true);

    if (!is_array($response)) {
        error_log('Invalid Gemini API JSON response');

        fail(
            'Invalid response received from Gemini API.',
            502
        );
    }

    // 9. Handle API errors
    if ($http >= 400) {
        $apiMessage = $response['error']['message']
            ?? 'Unknown Gemini API error';

        error_log('Gemini API error: ' . $apiMessage);

        fail(
            'Gemini API error: ' . $apiMessage,
            502
        );
    }

    // 10. Extract generated JSON
    $text = $response['candidates'][0]['content']['parts'][0]['text']
        ?? '';

    if (!is_string($text) || trim($text) === '') {
        fail(
            'Gemini returned an empty response. Try again.',
            502
        );
    }

    $parsed = json_decode($text, true);

    if (!is_array($parsed)) {
        error_log('Gemini returned invalid extraction JSON');

        fail(
            'Gemini returned invalid JSON. Please try again.',
            502
        );
    }

    // 11. Validate extracted fields
    $fields = [];

    $extractedFields = $parsed['fields'] ?? [];

    if (!is_array($extractedFields)) {
        $extractedFields = [];
    }

    foreach ($extractedFields as $field => $value) {

        if (!in_array($field, $allowedFields, true)) {
            continue;
        }

        if (!is_string($value)) {
            continue;
        }

        $value = trim($value);

        if ($value === '') {
            continue;
        }

        // Validate date format
        if ($field === 'date') {
            $date = DateTimeImmutable::createFromFormat(
                '!Y-m-d',
                $value
            );

            if (
                $date === false ||
                $date->format('Y-m-d') !== $value
            ) {
                continue;
            }
        }

        // Validate dropdown fields against supplied options
        if (
            array_key_exists($field, $options) &&
            is_array($options[$field])
        ) {
            $allowedValues = $options[$field];

            // Only accept simple string option arrays here.
            // Other option structures must be validated
            // by the frontend or adapted to this schema.
            if (
                array_is_list($allowedValues) &&
                count($allowedValues) > 0 &&
                count(array_filter(
                    $allowedValues,
                    'is_string'
                )) === count($allowedValues)
            ) {
                if (!in_array($value, $allowedValues, true)) {
                    continue;
                }
            }
        }

        $fields[$field] = $value;
    }

    // 12. Return compatible frontend response
    return [
        'transcript' => is_string($parsed['transcript'] ?? null)
            ? $parsed['transcript']
            : '',
        'fields' => $fields
    ];
}
