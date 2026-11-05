import { prepareRecording } from './transcriptModel.js';

const DATABASE_NAME = 'fintech-portal-demo';
const DATABASE_VERSION = 1;
const RECORDINGS_STORE = 'recordings';

let databasePromise;

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  }

  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(RECORDINGS_STORE)
        ? request.transaction.objectStore(RECORDINGS_STORE)
        : database.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });

      if (!store.indexNames.contains('requestDraftId')) {
        store.createIndex('requestDraftId', 'requestDraftId', { unique: false });
      }

      if (!store.indexNames.contains('createdAt')) {
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      const database = request.result;

      if (settled) {
        database.close();
        return;
      }

      settled = true;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };

    request.onerror = () => {
      if (settled) return;
      settled = true;
      databasePromise = undefined;
      reject(request.error || new Error('Unable to open recording storage.'));
    };

    request.onblocked = () => {
      if (settled) return;
      settled = true;
      databasePromise = undefined;
      reject(new Error('Recording storage upgrade is blocked by another tab.'));
    };
  });

  return databasePromise;
}

function withStore(mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    let transaction;
    let result;
    let operationError;

    try {
      transaction = database.transaction(RECORDINGS_STORE, mode);
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(operationError || transaction.error || new Error('Recording storage transaction failed.'));
    transaction.onabort = () => reject(operationError || transaction.error || new Error('Recording storage transaction was aborted.'));

    try {
      operation(transaction.objectStore(RECORDINGS_STORE), (value) => {
        result = value;
      }, transaction, (error) => {
        operationError = error;
        transaction.abort();
      });
    } catch (error) {
      operationError = error;
      try {
        transaction.abort();
      } catch {
        reject(error);
      }
    }
  }));
}

export function saveRecording(recording) {
  return withStore('readwrite', (store, setResult) => {
    store.put(recording);
    setResult(recording);
  });
}

export function getRecording(id) {
  return withStore('readonly', (store, setResult) => {
    const request = store.get(id);
    request.onsuccess = () => setResult(request.result);
  });
}

export function getRecordingsByDraft(requestDraftId) {
  return withStore('readonly', (store, setResult) => {
    const request = store.index('requestDraftId').getAll(requestDraftId);
    request.onsuccess = () => {
      setResult(request.result.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    };
  });
}

export function updateRecording(id, updates) {
  return withStore('readwrite', (store, setResult, transaction, setOperationError) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) {
        setOperationError(new Error('Recording was not found in storage.'));
        return;
      }

      const recording = {
        ...prepareRecording(request.result),
        ...updates,
        id,
        updatedAt: new Date().toISOString()
      };
      store.put(recording);
      setResult(recording);
    };
  });
}

export function updateRecordingIfTranscriptMatches(id, transcript, updates) {
  return withStore('readwrite', (store, setResult, transaction, setOperationError) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) {
        setOperationError(new Error('Recording was not found in storage.'));
        return;
      }

      const currentTranscript = typeof request.result.correctedTranscript === 'string'
        ? request.result.correctedTranscript
        : request.result.transcript || '';

      if (currentTranscript !== transcript) {
        setResult(null);
        return;
      }

      const recording = {
        ...prepareRecording(request.result),
        ...updates,
        id,
        updatedAt: new Date().toISOString()
      };
      store.put(recording);
      setResult(recording);
    };
  });
}

export function deleteRecording(id) {
  return withStore('readwrite', (store, setResult) => {
    store.delete(id);
    setResult(id);
  });
}