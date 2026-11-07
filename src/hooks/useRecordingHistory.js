import { useEffect, useState } from 'react';
import {
  getRecordingsByDraft,
  deleteRecording as deleteStoredRecording,
  saveRecording,
  updateRecording,
  updateRecordingIfTranscriptMatches
} from '../services/recordingStorage.js';
import { prepareRecording } from '../services/transcriptModel.js';

export const DEMO_DRAFT_ID = 'local-demo-draft';

function replaceRecording(recordings, recording) {
  return [recording, ...recordings.filter((item) => item.id !== recording.id)]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export default function useRecordingHistory() {
  const [recordings, setRecordings] = useState([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let active = true;

    const loadRecordings = async () => {
      try {
        const savedRecordings = (await getRecordingsByDraft(DEMO_DRAFT_ID)).map(prepareRecording);
        if (active) setRecordings(savedRecordings);

        for (const recording of savedRecordings) {
          if (recording.status !== 'processing' && recording.extractionStatus !== 'processing') continue;

          try {
            const recovered = await updateRecording(recording.id, {
              extractionStatus: 'error',
              extractionError: 'Processing was interrupted. Select this recording to retry.'
            });
            if (active) setRecordings((current) => replaceRecording(current, recovered));
          } catch (error) {
            if (active) setStorageError(error.message || 'Unable to recover an interrupted recording.');
          }
        }
      } catch (error) {
        if (active) setStorageError(error.message || 'Unable to load saved recordings.');
      } finally {
        if (active) setRecordingsLoading(false);
      }
    };

    loadRecordings();

    return () => {
      active = false;
    };
  }, []);

  const save = async (recording) => {
    try {
      const prepared = prepareRecording(recording);
      await saveRecording(prepared);
      setRecordings((current) => replaceRecording(current, prepared));
      setStorageError('');
      return prepared;
    } catch (error) {
      setStorageError(error.message || 'Unable to save this recording.');
      throw error;
    }
  };

  const update = async (id, updates) => {
    try {
      const recording = prepareRecording(await updateRecording(id, updates));
      setRecordings((current) => replaceRecording(current, recording));
      setStorageError('');
      return recording;
    } catch (error) {
      setStorageError(error.message || 'Unable to update this recording.');
      throw error;
    }
  };

  const updateIfTranscriptMatches = async (id, transcript, updates) => {
    try {
      const saved = await updateRecordingIfTranscriptMatches(id, transcript, updates);
      if (!saved) return null;

      const recording = prepareRecording(saved);
      setRecordings((current) => replaceRecording(current, recording));
      setStorageError('');
      return recording;
    } catch (error) {
      setStorageError(error.message || 'Unable to save extraction results.');
      throw error;
    }
  };

  const remove = async (id) => {
    try {
      await deleteStoredRecording(id);
      setRecordings((current) => current.filter((recording) => recording.id !== id));
      setStorageError('');
    } catch (error) {
      setStorageError(error.message || 'Unable to delete this recording.');
      throw error;
    }
  };

  return {
    recordings,
    recordingsLoading,
    storageError,
    saveRecording: save,
    updateRecording: update,
    updateIfTranscriptMatches,
    deleteRecording: remove
  };
}