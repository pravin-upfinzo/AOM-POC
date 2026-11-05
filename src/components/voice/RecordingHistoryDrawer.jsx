import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import AudioPlayer from './AudioPlayer.jsx';

const FIELD_LABELS = {
  entityName: 'Entity Name',
  entityType: 'Entity Type',
  tsp: 'TSP',
  services: 'Services',
  bankName: 'Bank Name',
  branchName: 'Branch Name',
  assignedBy: 'Task Assigned By',
  date: 'Date'
};

function formatDuration(durationMs) {
  const seconds = Math.floor(Math.max(0, durationMs || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function RecordingItem({ recording, number, active, onSelect }) {
  const fields = Object.entries(recording.extractedFields || {})
    .filter(([key, value]) => FIELD_LABELS[key] && value);

  return (
    <article className={`recording-item${active ? ' is-active' : ''}`}>
      <div className="recording-item-heading">
        <div>
          <h3>Recording {number}</h3>
          <p className="mini">{formatTimestamp(recording.createdAt)}</p>
        </div>
        <span className={`recording-status status-${recording.status}`}>{recording.status}</span>
      </div>
      <p className="recording-meta">
        {recording.recordedBy?.name || 'Demo User'} · Demo only · {formatDuration(recording.durationMs)}
      </p>
      <AudioPlayer audioBlob={recording.audioBlob} />
      {recording.transcript ? (
        <div className="recording-detail">
          <h4>Transcript</h4>
          <p>{recording.transcript}</p>
        </div>
      ) : <p className="mini recording-detail">No transcript available.</p>}
      {fields.length > 0 && (
        <div className="recording-detail">
          <h4>Extracted values</h4>
          <dl>
            {fields.map(([key, value]) => (
              <div key={key}>
                <dt>{FIELD_LABELS[key]}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {recording.error && <p className="recording-error">{recording.error}</p>}
      <button type="button" className="action secondary recording-select" onClick={() => onSelect(recording)}>
        {active ? 'Selected' : 'Select recording'}
      </button>
    </article>
  );
}

export default function RecordingHistoryDrawer({
  open,
  recordings,
  recordingsLoading,
  storageError,
  activeRecordingId,
  onSelect,
  onClose
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const closeHandlerRef = useRef(onClose);
  closeHandlerRef.current = onClose;

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
        dialogRef.current?.close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="recording-dialog"
      aria-labelledby="recording-history-title"
      onCancel={(event) => {
        event.preventDefault();
        event.currentTarget.close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="recording-drawer">
        <header className="recording-drawer-header">
          <div>
            <h2 id="recording-history-title">Recording History</h2>
            <p className="mini">{recordings.length} saved recording{recordings.length === 1 ? '' : 's'}</p>
          </div>
          <button ref={closeRef} type="button" className="recording-icon-button" aria-label="Close recording history" onClick={() => dialogRef.current?.close()}>
            <X size={19} />
          </button>
        </header>
        <div className="recording-drawer-content">
          {recordingsLoading && <p role="status" className="mini">Loading recordings…</p>}
          {storageError && <p role="alert" className="recording-storage-error">Recording storage: {storageError}</p>}
          {!recordingsLoading && recordings.length === 0 && (
            <p className="recording-empty">No saved recordings yet.</p>
          )}
          {recordings.map((recording, index) => (
            <RecordingItem
              key={recording.id}
              recording={recording}
              number={recordings.length - index}
              active={recording.id === activeRecordingId}
              onSelect={(selected) => {
                onSelect(selected);
                dialogRef.current?.close();
              }}
            />
          ))}
        </div>
      </div>
    </dialog>
  );
}