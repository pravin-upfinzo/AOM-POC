import { Activity, BookOpen, LoaderCircle, Mic, Pause, Play, Square, X } from 'lucide-react';

function formatTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function VoiceCapturePanel({
  isRecording,
  isPaused,
  isStarting,
  isFinalizing,
  pauseSupported,
  elapsedMs,
  audioLevel,
  processing,
  transcribing,
  transcript,
  interimTranscript,
  status,
  error,
  retryLabel,
  recordingCount,
  onStart,
  onPause,
  onResume,
  onStopAndProcess,
  onCancel,
  onOpenHistory,
  onRetryTranscription
}) {
  const capturing = isRecording || isPaused;

  return (
    <section className="voice-entry" aria-label="Voice input">
      {!capturing && !isStarting && !isFinalizing && !processing && (
        <div className="voice-entry-ready">
          <div>
            <p className="voice-entry-title">Fill the form by voice</p>
            <p className="mini">Speak naturally. We'll help fill the form.</p>
          </div>
          <div className="voice-entry-actions">
            <button type="button" className="action primary voice-start" onClick={onStart}>
              <Mic size={17} /> Start Voice Input
            </button>
            <button type="button" className="action secondary voice-history-button" onClick={onOpenHistory}>
              <BookOpen size={16} /> Recording History <span className="recording-count">{recordingCount}</span>
            </button>
          </div>
        </div>
      )}

      {capturing && (
        <div className="voice-capture-active">
          <div className="voice-capture-topline">
            <span className="live-dot" />
            <strong>{isPaused ? 'Recording paused' : 'Recording in progress'}</strong>
            <time aria-label="Recording duration">{formatTime(elapsedMs)}</time>
          </div>
          <div className={`audio-level${isPaused ? ' is-paused' : ''}`} role="img" aria-label="Live microphone audio level">
            {Array.from({ length: 28 }, (_, index) => {
              const profile = 0.35 + ((index * 7) % 13) / 20;
              const level = Math.min(1, audioLevel * profile * 5);
              return <span key={index} style={{ height: `${4 + level * 34}px` }} />;
            })}
          </div>
          {(transcript || interimTranscript) && (
            <div className="live-transcript-preview" aria-live="polite">
              {transcript && <p><strong>Transcript</strong> {transcript}</p>}
              {interimTranscript && <p className="live-interim-transcript">Listening: {interimTranscript}</p>}
            </div>
          )}
          <div className="voice-capture-actions">
            {pauseSupported && (isPaused
              ? <button type="button" className="action secondary" onClick={onResume}><Play size={15} /> Resume</button>
              : <button type="button" className="action secondary" onClick={onPause}><Pause size={15} /> Pause</button>)}
            <button type="button" className="action primary" disabled={isFinalizing} onClick={onStopAndProcess}>
              <Square size={14} /> Stop &amp; Process
            </button>
            <button type="button" className="action quiet-action" disabled={isFinalizing} onClick={onCancel}>
              <X size={15} /> Cancel
            </button>
          </div>
          {error && <p role="status" className="voice-inline-warning">{error}</p>}
        </div>
      )}

      {(isStarting || isFinalizing || processing || transcribing) && (
        <div className="voice-processing" role="status">
          <LoaderCircle size={17} className="processing-spinner" />
          <span>{isStarting ? 'Requesting microphone access…' : transcribing ? 'Transcribing audio…' : isFinalizing ? 'Saving recording…' : 'Processing voice input…'}</span>
          {transcript && <p className="live-final-transcript"><strong>Transcript</strong> {transcript}</p>}
          {interimTranscript && <p className="live-interim-transcript">Listening: {interimTranscript}</p>}
        </div>
      )}

      {error && !capturing && !isStarting && !isFinalizing && (
        <div className="voice-entry-error" role="alert">
          <p>{error}</p>
          {onRetryTranscription && <button type="button" className="action secondary" onClick={onRetryTranscription}><Activity size={15} /> {retryLabel || 'Retry Processing'}</button>}
          <button type="button" className="action secondary voice-history-button" onClick={onOpenHistory}>
            <BookOpen size={15} /> Recording History <span className="recording-count">{recordingCount}</span>
          </button>
        </div>
      )}

      {status && !processing && !transcribing && !isStarting && !isFinalizing && !error && (
        <p role="status" className="voice-inline-status">{status}</p>
      )}

      {(processing || transcribing || isStarting || isFinalizing) && (
        <button type="button" className="action secondary voice-history-button" onClick={onOpenHistory}>
          <BookOpen size={15} /> Recording History <span className="recording-count">{recordingCount}</span>
        </button>
      )}
    </section>
  );
}