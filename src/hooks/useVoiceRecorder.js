import { useEffect, useRef, useState } from 'react';

const SpeechRecognitionApi = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

function chooseMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';

  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function waitForRecognitionEnd(session) {
  if (!session.recognitionEnded) return Promise.resolve();

  return Promise.race([
    session.recognitionEnded,
    new Promise((resolve) => window.setTimeout(resolve, 1200))
  ]);
}

export default function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const sessionRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      const session = sessionRef.current;
      if (!session) return;

      session.cancelled = true;
      try { session.recognition?.abort(); } catch {}
      try {
        if (session.recorder?.state !== 'inactive') session.recorder.stop();
      } catch {}
      session.stream?.getTracks().forEach((track) => track.stop());
      sessionRef.current = null;
    };
  }, []);

  const start = async ({ recordingId, mode, onTranscript, onNotice, onComplete }) => {
    if (sessionRef.current) throw new Error('A recording is already active.');
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is unavailable in this browser.');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Audio recording is unavailable in this browser.');
    }

    setIsFinalizing(true);
    const pendingSession = { starting: true };
    sessionRef.current = pendingSession;
    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || sessionRef.current !== pendingSession) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      let resolveRecognitionEnd;
      const session = {
        recordingId,
        mode,
        stream,
        recorder,
        chunks: [],
        startedAt: new Date().toISOString(),
        startedAtMs: performance.now(),
        cancelled: false,
        stopping: false,
        interrupted: false,
        recognition: null,
        recognitionEnded: null,
        onTranscript,
        onNotice,
        onComplete
      };
      sessionRef.current = session;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) session.chunks.push(event.data);
      };

      recorder.onerror = (event) => {
        session.interrupted = true;
        session.captureError = event.error?.message || 'Audio recording was interrupted.';
        session.onNotice?.(session.captureError);
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {}
      };

      recorder.onstop = async () => {
        session.stopping = true;
        stream.getTracks().forEach((track) => track.stop());
        const actualMimeType = recorder.mimeType || mimeType || session.chunks[0]?.type || 'application/octet-stream';
        const audioBlob = new Blob(session.chunks, { type: actualMimeType });
        const result = {
          recordingId,
          audioBlob,
          mimeType: actualMimeType,
          startedAt: session.startedAt,
          stoppedAt: new Date().toISOString(),
          durationMs: Math.max(0, Math.round(performance.now() - session.startedAtMs)),
          error: session.captureError || null
        };

        if (mountedRef.current) setIsRecording(false);

        try {
          await waitForRecognitionEnd(session);
          if (!session.cancelled) await session.onComplete?.(result);
        } catch (error) {
          if (!session.cancelled) session.onNotice?.(error.message || 'Unable to finish saving the recording.');
        } finally {
          if (sessionRef.current === session) sessionRef.current = null;
          if (mountedRef.current) setIsFinalizing(false);
        }
      };

      for (const track of stream.getTracks()) {
        track.addEventListener('ended', () => {
          if (session.stopping || session.cancelled) return;
          session.interrupted = true;
          session.captureError = 'Microphone input ended unexpectedly.';
          session.onNotice?.(session.captureError);
        }, { once: true });
      }

      recorder.start(250);

      if (mode === 'browser') {
        if (!SpeechRecognitionApi) {
          onNotice?.('Browser speech recognition is unavailable. Audio is still recording; you can stop it manually or use Gemini Audio mode.');
        } else {
          const recognition = new SpeechRecognitionApi();
          session.recognition = recognition;
          session.recognitionEnded = new Promise((resolve) => {
            resolveRecognitionEnd = resolve;
          });
          recognition.lang = 'en-IN';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            let words = '';
            for (let index = 0; index < event.results.length; index += 1) {
              words += `${event.results[index][0].transcript} `;
            }
            session.onTranscript?.(words.trim());
          };
          recognition.onerror = (event) => {
            if (event.error !== 'aborted') {
              session.onNotice?.(`Speech recognition: ${event.error}. Audio recording will continue.`);
            }
          };
          recognition.onend = () => resolveRecognitionEnd?.();

          try {
            recognition.start();
          } catch (error) {
            resolveRecognitionEnd?.();
            session.onNotice?.(`Speech recognition could not start: ${error.message}. Audio recording will continue.`);
          }
        }
      }

      setIsRecording(true);
      setIsFinalizing(false);
      return true;
    } catch (error) {
      const session = sessionRef.current;
      session?.recognition?.abort();
      try {
        if (session?.recorder?.state !== 'inactive') session?.recorder?.stop();
      } catch {}
      stream?.getTracks().forEach((track) => track.stop());
      sessionRef.current = null;
      if (mountedRef.current) setIsFinalizing(false);
      throw error;
    }
  };

  const stop = () => {
    const session = sessionRef.current;
    if (!session || session.stopping) return;

    session.stopping = true;
    if (mountedRef.current) {
      setIsRecording(false);
      setIsFinalizing(true);
    }

    try { session.recognition?.stop(); } catch {}
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch (error) {
      session.onNotice?.(error.message || 'Unable to stop the audio recorder.');
      session.stream.getTracks().forEach((track) => track.stop());
    }
  };

  return { isRecording, isFinalizing, start, stop };
}