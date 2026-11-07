import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import AudioPlayer from './AudioPlayer.jsx';
import { getWorkingTranscript, prepareRecording } from '../../services/transcriptModel.js';

function formatDuration(durationMs) {
  const seconds = Math.floor(Math.max(0, durationMs || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

export default function RecordingDetail({
  rawRecording,
  number,
  active,
  processing,
  transcribing,
  onDraftChange,
  onBack,
  onSaveAndReprocess,
  onRetryTextExtraction,
  onRetryAudioTranscription,
  onChooseTranscript,
  onDelete
}) {
  const recording = prepareRecording(rawRecording);
  const statusLabel = transcribing ? 'Transcribing' : processing ? 'Processing' : recording.transcriptionStatus === 'error' ? 'Transcription error' : recording.extractionStatus === 'error' ? 'Extraction error' : recording.status;
  const statusClass = statusLabel.toLowerCase().replaceAll(' ', '-');
  const workingTranscript = getWorkingTranscript(recording);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workingTranscript);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = editing && draft !== workingTranscript;

  useEffect(() => {
    setDraft(workingTranscript);
    setEditing(false);
    setError('');
    setNotice('');
  }, [recording.id, workingTranscript]);

  const saveAndReprocess = async () => {
    if (!draft.trim()) {
      setError('Transcript cannot be empty. Add words or cancel editing.');
      return;
    }

    setError('');
    setNotice('');
    try {
      await onSaveAndReprocess(recording, draft);
      setEditing(false);
      setNotice('Transcript saved and sent for processing.');
    } catch (saveError) {
      setError('Unable to save and process this transcript. Your recording remains available.');
    }
  };

  const cancelEditing = () => {
    setDraft(workingTranscript);
    onDraftChange(recording.id, workingTranscript);
    setEditing(false);
    setError('');
  };

  const chooseTranscript = async (value, source) => {
    if (dirty && !window.confirm('Replace your unsaved transcript edits?')) return;
    setError('');
    setNotice('');
    try {
      await onChooseTranscript(recording, value, source);
      setDraft(value);
      setEditing(false);
      setNotice('Transcript selected. Review the matching suggestions before confirming.');
    } catch (choiceError) {
      setError('Unable to select this transcript. Your current transcript is unchanged.');
    }
  };

  const removeRecording = async () => {
    const confirmed = window.confirm(
      `Delete Recording ${number}? This permanently removes its saved audio and transcript history from this browser. Previously confirmed form values will remain unchanged.`
    );
    if (!confirmed) return;
    setDeleteError('');
    try {
      await onDelete(recording);
    } catch {
      setDeleteError('Unable to delete this recording. It is still saved in history.');
    }
  };

  return (
    <div className="recording-detail-view">
      <header className="recording-detail-heading">
        <button type="button" className="recording-icon-button" aria-label="Back to recording history" onClick={onBack}>
          <ArrowLeft size={17} />
        </button>
        <div>
          <h3>Voice Transcript · Recording {number}</h3>
          <p className="mini">{formatTimestamp(recording.createdAt)} · {formatDuration(recording.durationMs)} · Demo only</p>
        </div>
        <span className={`recording-status status-${statusClass}`}>{statusLabel}</span>
      </header>

      <AudioPlayer audioBlob={recording.audioBlob} />

      <section className="recording-detail-section">
        <div className="recording-section-title">
          <h4>{editing ? 'Edit Transcript' : 'Transcript'}</h4>
          {!editing && <button type="button" className="action secondary compact-action" onClick={() => { setDraft(workingTranscript); setEditing(true); setNotice(''); }}><Pencil size={14} /> Edit Transcript</button>}
        </div>
        {editing ? (
          <>
            <p className="mini">Original: {recording.originalTranscript || 'No browser transcript was captured.'}</p>
            <textarea className="transcript-editor" aria-label="Edit voice transcript" value={draft} onChange={(event) => { setDraft(event.target.value); onDraftChange(recording.id, event.target.value); }} rows={5} />
            {dirty && <span className="unsaved-label">Unsaved changes</span>}
            <div className="recording-actions">
              <button type="button" className="action primary" disabled={!dirty || processing} onClick={saveAndReprocess}>Save &amp; Reprocess</button>
              <button type="button" className="action secondary" onClick={cancelEditing}>Cancel Editing</button>
            </div>
          </>
        ) : (
          <>
            <p className="transcript-reading">{workingTranscript || (recording.transcriptionStatus === 'processing' ? 'Transcribing audio…' : 'No transcript is available.')}</p>
            <p className="mini transcript-source">Source: {recording.activeTranscriptSource || 'browser'}{recording.transcriptEdited ? ' · edited' : ''}</p>
          </>
        )}
        {recording.originalTranscript && recording.originalTranscript !== workingTranscript && (
          <p className="mini original-evidence">Original transcript: {recording.originalTranscript}</p>
        )}
        {recording.extractionStale && <p className="recording-stale">These suggestions came from a different transcript and cannot be confirmed.</p>}
      </section>

      {error && <p role="alert" className="recording-error">{error}</p>}
      {recording.transcriptionError && <p role="alert" className="recording-error">{recording.transcriptionError}</p>}
      {recording.extractionError && <p role="alert" className="recording-error">{recording.extractionError}</p>}
      {deleteError && <p role="alert" className="recording-error">{deleteError}</p>}
      {notice && <p role="status" className="mini">{notice}</p>}
      {recording.transcriptionStatus === 'processing' && <p role="status" className="mini">Transcribing audio…</p>}

      <details className="advanced-transcription">
        <summary><ChevronDown size={15} /> Advanced Transcription Options</summary>
        <div className="advanced-transcription-content">
          {recording.extractionError && workingTranscript.trim() && (
            <button type="button" className="action secondary" disabled={processing || transcribing} onClick={() => onRetryTextExtraction(recording)}>
              {processing ? 'Processing…' : 'Retry Text Processing'}
            </button>
          )}
          {recording.audioBlob instanceof Blob && recording.audioBlob.size > 0 && (
            <button type="button" className="action secondary" disabled={processing || transcribing} onClick={() => onRetryAudioTranscription(recording)}>
              {transcribing ? 'Transcribing…' : 'Retry with Gemini Audio'}
            </button>
          )}
          {recording.geminiTranscript && (
            <div className="transcript-comparison">
              <h4>Browser Transcript</h4>
              <p>{recording.originalTranscript || 'No browser transcript captured.'}</p>
              <h4>Gemini Transcript</h4>
              <p>{recording.geminiTranscript}</p>
              <div className="recording-actions">
                <button type="button" className="action secondary" onClick={() => chooseTranscript(recording.originalTranscript || '', recording.transcriptSource === 'gemini-audio' ? 'gemini-audio' : 'browser')}>Use Original Transcript</button>
                <button type="button" className="action secondary" onClick={() => chooseTranscript(recording.geminiTranscript, 'gemini-audio')}>Use Gemini Transcript</button>
                <button type="button" className="action secondary" onClick={() => chooseTranscript(draft, 'user-corrected')}>Keep My Edited Transcript</button>
              </div>
            </div>
          )}
          {recording.originalTranscript && (
            <button type="button" className="action secondary" onClick={() => chooseTranscript(recording.originalTranscript, recording.transcriptSource === 'gemini-audio' ? 'gemini-audio' : 'browser')}>
              <RotateCcw size={14} /> Restore Original Transcript
            </button>
          )}
          <button type="button" className="action danger-outline" onClick={removeRecording}><Trash2 size={14} /> Delete Recording</button>
        </div>
      </details>
    </div>
  );
}