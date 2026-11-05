export function prepareRecording(recording) {
  const transcript = typeof recording.transcript === 'string' ? recording.transcript : '';
  const originalTranscript = typeof recording.originalTranscript === 'string'
    ? recording.originalTranscript
    : transcript;
  const correctedTranscript = typeof recording.correctedTranscript === 'string'
    ? recording.correctedTranscript
    : transcript;
  const hasExtractedFields = Object.keys(recording.extractedFields || {}).length > 0
    || Object.keys(recording.unmatchedFields || {}).length > 0;
  const extractionTranscriptSnapshot = Object.hasOwn(recording, 'extractionTranscriptSnapshot')
    ? recording.extractionTranscriptSnapshot
    : hasExtractedFields ? transcript : null;
  const originalSource = recording.transcriptSource === 'gemini-audio' ? 'gemini-audio' : 'browser';

  return {
    ...recording,
    transcript: correctedTranscript,
    originalTranscript,
    correctedTranscript,
    activeTranscriptSource: recording.activeTranscriptSource
      || (recording.transcriptEdited ? 'user-corrected' : originalSource),
    transcriptEdited: typeof recording.transcriptEdited === 'boolean'
      ? recording.transcriptEdited
      : correctedTranscript !== originalTranscript,
    transcriptUpdatedAt: recording.transcriptUpdatedAt ?? null,
    geminiTranscript: typeof recording.geminiTranscript === 'string' ? recording.geminiTranscript : null,
    extractionSource: recording.extractionSource ?? (hasExtractedFields ? 'legacy' : null),
    extractionTranscriptSnapshot,
    extractionStale: Boolean(recording.extractionStale)
      || (hasExtractedFields && extractionTranscriptSnapshot !== correctedTranscript),
    transcriptionStatus: recording.transcriptionStatus || 'idle',
    transcriptionError: recording.transcriptionError ?? null,
    extractionError: recording.extractionError ?? null
  };
}

export function getWorkingTranscript(recording) {
  return typeof recording.correctedTranscript === 'string'
    ? recording.correctedTranscript
    : recording.transcript || '';
}

export function createTranscriptSelection(recording, transcript, source) {
  const originalTranscript = typeof recording.originalTranscript === 'string'
    ? recording.originalTranscript
    : recording.transcript || '';
  const hasExtractedFields = Object.keys(recording.extractedFields || {}).length > 0
    || Object.keys(recording.unmatchedFields || {}).length > 0;

  return {
    originalTranscript,
    correctedTranscript: transcript,
    transcript,
    activeTranscriptSource: source,
    transcriptEdited: transcript !== originalTranscript,
    transcriptUpdatedAt: transcript === originalTranscript ? null : new Date().toISOString(),
    extractionStale: hasExtractedFields
      && recording.extractionTranscriptSnapshot !== transcript
  };
}