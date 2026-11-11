# Fintech Portal — React Vite + Tailwind 4 + PHP Voice-to-Form

## Requirements
- Node.js 20.19+ (or 22.12+), npm
- PHP 8.1+ with `curl`, `fileinfo`, `mbstring` extensions
- Gemini API key from https://aistudio.google.com/apikey
- Browser microphone permission and localhost/HTTPS

## Run

If `backend/.env` does not exist, create it from the example:

```bash
test -f backend/.env || cp backend/.env.example backend/.env
```

Set `GEMINI_API_KEY` in `backend/.env`. The configured model is
`gemini-3.5-flash-lite`; `GEMINI_MODEL` can be left unchanged. Never commit
the real API key. The backend loads this file automatically, while process
environment variables take precedence.

**Terminal 1 — PHP API:**

```bash
cd backend
php -S 127.0.0.1:8000 router.php
```

**Terminal 2 — React:**

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Voice processing
Browser `SpeechRecognition` displays recognized speech while `MediaRecorder` captures audio. Stop & Process saves the recording and sends finalized transcript text to PHP for Gemini extraction. If no finalized transcript is available, the saved audio is sent to the existing Gemini audio endpoint. Recognition support varies by browser, and Gemini processing may incur charges.

Start Voice Input → speak → Stop & Process → review → Apply to Form. Record again to fill missing fields. Existing confirmed values require an explicit keep-or-replace choice; possible dropdown matches require verification. Changing bank clears the old branch when a valid new branch is not provided.

## Recording history
Completed audio Blobs, transcripts, and extraction metadata are stored in IndexedDB for this browser origin. They remain available after refresh and are not sent to PHP by default. Processing in Browser Speech mode sends the transcript; Gemini Audio mode sends the selected audio. The identity shown in history is a demo-only label, not an authenticated user. Clearing browser site data removes these recordings. The form itself is not persisted.

Microphone capture requires `getUserMedia` support and a secure context such as localhost or HTTPS. `MediaRecorder` and browser speech recognition support varies by browser. If speech recognition is unavailable, audio capture continues and Stop & Process uses Gemini Audio as the fallback.

## Transcript review
Recording History keeps the initial transcript read-only and stores a separate corrected transcript. Process with Gemini sends the saved corrected text to the existing extraction endpoint. Retry Audio Transcription uploads the selected local audio only after the user requests it; Gemini's transcript is stored separately and must be explicitly selected before its extraction is eligible to apply. Unmatched dropdown candidates are shown for manual review and are never applied as valid options. Browser phrase hints are feature-detected and do not replace transcript text automatically.

## Voice form entry
Use **Start Voice Input** to capture speech and audio together. Stop & Process saves the recording, extracts from finalized browser speech, and falls back to Gemini Audio only when there is no finalized transcript. Suggested field values remain drafts until **Apply to Form**; they do not overwrite confirmed form values before review. Recording History is a compact list; Edit Transcript and Save & Reprocess are available in an individual recording's details, with Gemini comparison under Advanced Transcription Options. Deleting a recording removes its local audio and transcript history, but leaves confirmed form values unchanged.

## Important production notes
- **This is a functional prototype, not a production-ready fintech backend.** The Submit Request button validates locally but does not save data. Connect it to your existing authenticated PHP submission endpoint.
- Protect API endpoints with session authentication, CSRF controls, per-user rate limits, and strict request-size limits. Do not expose Gemini API keys to React. The PHP demo accepts client-provided dropdown options; production should load allowed values from your database instead.
- Validate and authorize all extracted values again on the server. Never assume AI output is correct.
- Audio is sent to Gemini in audio mode; browser recognition may send speech to a browser-vendor service. Obtain consent and confirm vendor data handling/retention requirements before using customer data.
- For sensitive fintech data, review provider privacy terms and regulatory requirements before enabling third-party processing.
- PHP `upload_max_filesize` and `post_max_size` should permit the chosen limit (8 MB in this sample).
- Silent audio cannot be reliably detected by file-size alone; Gemini is instructed to return no fields for silence, but production should add voice-activity detection and tests.
- The sample uses a basic dropdown matcher; ambiguous matches should be reviewed. Branch must match selected bank.
- Some browsers end speech recognition automatically during silence; restart for another recording. Language is set to `en-IN` in the sample.
