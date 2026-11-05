import { useEffect, useState } from 'react';
import {
  getRecordingsByDraft,
  saveRecording,
  updateRecording
} from '../services/recordingStorage.js';

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
        const savedRecordings = await getRecordingsByDraft(DEMO_DRAFT_ID);
        if (active) setRecordings(savedRecordings);

        for (const recording of savedRecordings) {
          if (recording.status !== 'processing') continue;

          try {
            const recovered = await updateRecording(recording.id, {
              status: 'error',
              error: 'Processing was interrupted. Select this recording to retry.'
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
      await saveRecording(recording);
      setRecordings((current) => replaceRecording(current, recording));
      setStorageError('');
      return recording;
    } catch (error) {
      setStorageError(error.message || 'Unable to save this recording.');
      throw error;
    }
  };

  const update = async (id, updates) => {
    try {
      const recording = await updateRecording(id, updates);
      setRecordings((current) => replaceRecording(current, recording));
      setStorageError('');
      return recording;
    } catch (error) {
      setStorageError(error.message || 'Unable to update this recording.');
      throw error;
    }
  };

  return {
    recordings,
    recordingsLoading,
    storageError,
    saveRecording: save,
    updateRecording: update
  };
}