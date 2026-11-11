import { useEffect, useRef, useState } from 'react';
import { BookOpen, Trash2, X } from 'lucide-react';
import AudioPlayer from './AudioPlayer.jsx';
import RecordingDetail from './RecordingDetail.jsx';
import { getWorkingTranscript, prepareRecording } from '../../services/transcriptModel.js';

function formatDuration(durationMs) {
  const seconds = Math.floor(Math.max(0, durationMs || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function HistoryItem({ recording: rawRecording, number, onOpen, onDelete, deleting, processing, transcribing }) {
  const recording = prepareRecording(rawRecording);
  const statusLabel = transcribing ? 'Transcribing' : processing ? 'Processing' : recording.transcriptionStatus === 'error' ? 'Transcription error' : recording.extractionStatus === 'error' ? 'Extraction error' : recording.status;
  const statusClass = statusLabel.toLowerCase().replaceAll(' ', '-');
  const transcript = getWorkingTranscript(recording);
  const preview = transcript || recording.transcriptionStatus === 'processing'
    ? transcript || 'Transcribing audio…'
    : 'No transcript available.';
  const [deleteError, setDeleteError] = useState('');

  const deleteRecording = async () => {
    const confirmed = window.confirm(
      `Delete Recording ${number} (${formatTimestamp(recording.createdAt)})? This removes its saved audio and transcript history from this browser. Previously confirmed form values will remain unchanged.`
    );
    if (!confirmed) return;

    setDeleteError('');
    try {
      await onDelete(recording);
    } catch (error) {
      setDeleteError(error.message || 'Unable to delete this recording.');
    }
  };

  return (
    <article className="history-row">
      <div className="history-row-main">
        <div className="recording-item-heading">
          <div>
            <h3>Recording {number}</h3>
            <p className="mini">{formatTimestamp(recording.createdAt)} · {formatDuration(recording.durationMs)}</p>
          </div>
          <span className={`recording-status status-${statusClass}`}>{statusLabel}</span>
        </div>
        <AudioPlayer audioBlob={recording.audioBlob} />
        <p className="history-transcript-preview">{preview}</p>
        <div className="history-row-actions">
          <button type="button" className="action secondary compact-action" onClick={() => onOpen(recording)}>
            <BookOpen size={14} /> View Details
          </button>
          <button type="button" className="action danger-outline compact-action" disabled={deleting} onClick={deleteRecording}>
            <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        {deleteError && <p className="recording-error" role="alert">{deleteError}</p>}
      </div>
    </article>
  );
}

export default function RecordingHistoryDrawer({
  open,
  initialDetailId,
  recordings,
  recordingsLoading,
  storageError,
  activeRecordingId,
  processingIds,
  transcribingIds,
  deletingIds,
  onDraftChange,
  onSelect,
  onSaveAndReprocess,
  onRetryTextExtraction,
  onRetryAudioTranscription,
  onChooseTranscript,
  onDelete,
  onClose
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const closeHandlerRef = useRef(onClose);
  const [detailId, setDetailId] = useState(null);
  const [detailHasUnsavedEdits, setDetailHasUnsavedEdits] = useState(false);
  closeHandlerRef.current = onClose;
  const selectedRecording = recordings.find((recording) => recording.id === detailId);
  const selectedNumber = selectedRecording ? recordings.findIndex((recording) => recording.id === selectedRecording.id) : -1;
  const recordingNumber = selectedNumber < 0 ? 0 : recordings.length - selectedNumber;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) setDetailId(initialDetailId || null);
  }, [open, initialDetailId]);

  useEffect(() => {
    setDetailHasUnsavedEdits(false);
  }, [selectedRecording?.id, selectedRecording?.correctedTranscript]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const handleClose = () => closeHandlerRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, detailHasUnsavedEdits]);

  const handleDelete = async (recording) => {
    await onDelete(recording);
    if (detailId === recording.id) {
      setDetailId(null);
      setDetailHasUnsavedEdits(false);
    }
  };

  const closeDrawer = () => {
    if (detailHasUnsavedEdits && !window.confirm('Discard unsaved transcript edits and close Voice Transcript?')) return;
    dialogRef.current?.close();
  };

  const backToHistory = () => {
    if (detailHasUnsavedEdits && !window.confirm('Discard unsaved transcript edits and return to Recording History?')) return;
    setDetailHasUnsavedEdits(false);
    setDetailId(null);
  };

  return (
    <dialog
      ref={dialogRef}
      className="recording-dialog"
      aria-labelledby="recording-history-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDrawer();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDrawer();
      }}
    >
      <div className="recording-drawer">
        <header className="recording-drawer-header">
          <div>
            <h2 id="recording-history-title">{selectedRecording ? 'Voice Transcript' : 'Recording History'}</h2>
            <p className="mini">{selectedRecording ? 'Stored locally in this browser' : `${recordings.length} saved recording${recordings.length === 1 ? '' : 's'}`}</p>
          </div>
          <button ref={closeRef} type="button" className="recording-icon-button" aria-label="Close recording history" onClick={closeDrawer}>
            <X size={19} />
          </button>
        </header>
        <div className="recording-drawer-content">
          {storageError && <p role="alert" className="recording-storage-error">Recording storage: {storageError}</p>}
          {recordingsLoading && <p role="status" className="mini">Loading recordings…</p>}
          {selectedRecording ? (
            <RecordingDetail
              key={selectedRecording.id}
              rawRecording={selectedRecording}
              number={recordingNumber}
              active={selectedRecording.id === activeRecordingId}
              processing={processingIds.includes(selectedRecording.id)}
              transcribing={transcribingIds.includes(selectedRecording.id)}
              onDraftChange={(id, value) => {
                onDraftChange(id, value);
                setDetailHasUnsavedEdits(value !== getWorkingTranscript(selectedRecording));
              }}
              onBack={backToHistory}
              onSaveAndReprocess={onSaveAndReprocess}
              onRetryTextExtraction={onRetryTextExtraction}
              onRetryAudioTranscription={onRetryAudioTranscription}
              onChooseTranscript={onChooseTranscript}
              onDelete={handleDelete}
            />
          ) : !recordingsLoading && recordings.length === 0 ? (
            <p className="recording-empty">No saved recordings yet.</p>
          ) : (
            recordings.map((recording, index) => (
              <HistoryItem
                key={recording.id}
                recording={recording}
                number={recordings.length - index}
                deleting={deletingIds.includes(recording.id)}
                processing={processingIds.includes(recording.id)}
                transcribing={transcribingIds.includes(recording.id)}
                onOpen={(selected) => {
                  setDetailHasUnsavedEdits(false);
                  setDetailId(selected.id);
                  onSelect(selected);
                }}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}
