import { useEffect, useRef, useState } from 'react';
import { SPEECH_PHRASE_HINTS } from '../config/domainVocabulary.js';

const SpeechRecognitionApi = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;
const SpeechRecognitionPhraseApi = typeof window !== 'undefined'
  ? window.SpeechRecognitionPhrase
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

function emitTranscript(session) {
  session.onTranscript?.([...session.speechSegments, session.currentSpeech].filter(Boolean).join(' ').trim());
}

function startRecognition(session) {
  if (!SpeechRecognitionApi || session.mode !== 'browser' || session.paused || session.stopping || session.cancelled) return;

  const recognition = new SpeechRecognitionApi();
  session.recognition = recognition;
  session.currentSpeech = '';
  session.recognitionEnded = new Promise((resolve) => {
    session.resolveRecognitionEnd = resolve;
  });
  recognition.lang = 'en-IN';
  recognition.continuous = true;
  recognition.interimResults = true;

  if (!session.phraseHintsUnsupported && 'phrases' in recognition && typeof SpeechRecognitionPhraseApi === 'function') {
    try {
      recognition.phrases = SPEECH_PHRASE_HINTS.map((phrase) => new SpeechRecognitionPhraseApi(phrase, 1.0));
    } catch {
      session.onNotice?.('Speech phrase hints are unavailable in this browser.');
    }
  }

  recognition.onresult = (event) => {
    let words = '';
    for (let index = 0; index < event.results.length; index += 1) {
      words += `${event.results[index][0].transcript} `;
    }
    session.currentSpeech = words.trim();
    emitTranscript(session);
  };

  recognition.onerror = (event) => {
    if (event.error === 'phrases-not-supported') {
      session.phraseHintsUnsupported = true;
      try { recognition.abort(); } catch {}
      return;
    }
    if (event.error !== 'aborted') session.onNotice?.(`Speech recognition: ${event.error}. Audio recording will continue.`);
  };

  recognition.onend = () => {
    if (session.currentSpeech) session.speechSegments.push(session.currentSpeech);
    session.currentSpeech = '';
    emitTranscript(session);
    session.resolveRecognitionEnd?.();
    session.resolveRecognitionEnd = null;

    if (session.pauseRequested) {
      session.pauseRequested = false;
      return;
    }

    if (!session.stopping && !session.cancelled && !session.paused) {
      window.setTimeout(() => startRecognition(session), 250);
    }
  };

  try {
    recognition.start();
  } catch (error) {
    session.resolveRecognitionEnd?.();
    session.resolveRecognitionEnd = null;
    session.onNotice?.(`Speech recognition could not start: ${error.message}. Audio recording will continue.`);
  }
}

function startAudioMeter(session) {
  const AudioContextApi = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextApi) return;

  try {
    session.audioContext = new AudioContextApi();
    const source = session.audioContext.createMediaStreamSource(session.stream);
    session.analyser = session.audioContext.createAnalyser();
    session.analyser.fftSize = 256;
    session.levelSamples = new Uint8Array(session.analyser.fftSize);
    source.connect(session.analyser);

    const sample = () => {
      if (!session.analyser || session.cancelled || session.stopping) return;
      session.analyser.getByteTimeDomainData(session.levelSamples);
      const sum = session.levelSamples.reduce((total, value) => {
        const amplitude = (value - 128) / 128;
        return total + amplitude * amplitude;
      }, 0);
      session.onAudioLevel?.(session.paused ? 0 : Math.sqrt(sum / session.levelSamples.length));
      session.animationFrame = window.requestAnimationFrame(sample);
    };

    sample();
  } catch {
    session.onAudioLevel?.(0);
  }
}

function stopAudioMeter(session) {
  if (session.animationFrame) window.cancelAnimationFrame(session.animationFrame);
  session.onAudioLevel?.(0);
  session.audioContext?.close().catch(() => {});
  session.audioContext = null;
}

export default function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [pauseSupported, setPauseSupported] = useState(false);
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
      clearInterval(session.elapsedTimer);
      stopAudioMeter(session);
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

    setIsStarting(true);
    const pendingSession = { starting: true };
    sessionRef.current = pendingSession;
    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || sessionRef.current !== pendingSession) {
        stream.getTracks().forEach((track) => track.stop());
        if (mountedRef.current) setIsStarting(false);
        return false;
      }
      setIsStarting(false);

      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      let resolveRecognitionEnd;
      const session = {
        recordingId,
        mode,
        stream,
        recorder,
        chunks: [],
        speechSegments: [],
        currentSpeech: '',
        startedAt: new Date().toISOString(),
        elapsedBeforePause: 0,
        segmentStartedAt: performance.now(),
        paused: false,
        pauseRequested: false,
        cancelled: false,
        stopping: false,
        interrupted: false,
        recognition: null,
        recognitionEnded: null,
        onTranscript,
        onNotice,
        onComplete,
        onAudioLevel: setAudioLevel
      };
      session.finishedPromise = new Promise((resolve) => {
        session.resolveFinished = resolve;
      });
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
        clearInterval(session.elapsedTimer);
        stopAudioMeter(session);
        const actualMimeType = recorder.mimeType || mimeType || session.chunks[0]?.type || 'application/octet-stream';
        const durationMs = Math.max(0, Math.round(session.elapsedBeforePause + (session.paused ? 0 : performance.now() - session.segmentStartedAt)));
        const audioBlob = new Blob(session.chunks, { type: actualMimeType });
        const result = {
          recordingId,
          audioBlob,
          mimeType: actualMimeType,
          startedAt: session.startedAt,
          stoppedAt: new Date().toISOString(),
          durationMs,
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
          session.resolveFinished?.();
          if (mountedRef.current) {
            setIsFinalizing(false);
            setIsPaused(false);
            setPauseSupported(false);
            setElapsedMs(durationMs);
          }
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

      session.elapsedTimer = window.setInterval(() => {
        const total = session.elapsedBeforePause
          + (session.paused ? 0 : performance.now() - session.segmentStartedAt);
        setElapsedMs(Math.max(0, Math.round(total)));
      }, 100);
      startAudioMeter(session);

      if (mode === 'browser') {
        if (!SpeechRecognitionApi) {
          onNotice?.('Browser speech recognition is unavailable. Audio is still recording; you can stop it manually or use Gemini Audio mode.');
        } else {
          startRecognition(session);
        }
      }

      setIsRecording(true);
      setIsPaused(false);
      setElapsedMs(0);
      setPauseSupported(typeof recorder.pause === 'function' && typeof recorder.resume === 'function');
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
      if (mountedRef.current) {
        setIsStarting(false);
        setIsFinalizing(false);
        setPauseSupported(false);
        setAudioLevel(0);
      }
      throw error;
    }
  };

  const pause = async () => {
    const session = sessionRef.current;
    if (!session || session.paused || session.stopping || typeof session.recorder.pause !== 'function') return false;

    try {
      session.elapsedBeforePause += Math.max(0, performance.now() - session.segmentStartedAt);
      session.paused = true;
      session.recorder.pause();
      setIsPaused(true);
      setElapsedMs(Math.round(session.elapsedBeforePause));
      session.onAudioLevel?.(0);

      if (session.recognition) {
        session.pauseRequested = true;
        try { session.recognition.stop(); } catch {}
      }
      return true;
    } catch (error) {
      session.paused = false;
      session.segmentStartedAt = performance.now();
      session.onNotice?.('Unable to pause this recording in the current browser.');
      return false;
    }
  };

  const resume = async () => {
    const session = sessionRef.current;
    if (!session || !session.paused || session.stopping || typeof session.recorder.resume !== 'function') return false;

    try {
      await waitForRecognitionEnd(session);
      session.recorder.resume();
      session.paused = false;
      session.segmentStartedAt = performance.now();
      setIsPaused(false);
      if (session.mode === 'browser' && SpeechRecognitionApi) startRecognition(session);
      return true;
    } catch {
      session.onNotice?.('Unable to resume this recording in the current browser.');
      return false;
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

  const cancel = async () => {
    const session = sessionRef.current;
    if (!session || session.starting || session.stopping) return false;

    session.cancelled = true;
    session.stopping = true;
    if (mountedRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      setIsFinalizing(true);
    }

    try { session.recognition?.abort(); } catch {}
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch {
      session.stream.getTracks().forEach((track) => track.stop());
      clearInterval(session.elapsedTimer);
      stopAudioMeter(session);
      session.resolveFinished?.();
      sessionRef.current = null;
      if (mountedRef.current) {
        setIsStarting(false);
        setIsFinalizing(false);
      }
    }

    await session.finishedPromise;
    return true;
  };

  return { isRecording, isPaused, isStarting, isFinalizing, elapsedMs, audioLevel, pauseSupported, start, pause, resume, stop, cancel };
}