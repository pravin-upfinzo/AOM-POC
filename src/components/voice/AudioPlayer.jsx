import { useEffect, useState } from 'react';

export default function AudioPlayer({ audioBlob }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!(audioBlob instanceof Blob) || audioBlob.size === 0) {
      setAudioUrl('');
      setUnavailable(true);
      return undefined;
    }

    let url;

    try {
      url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setUnavailable(false);
    } catch {
      setAudioUrl('');
      setUnavailable(true);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioBlob]);

  if (unavailable || !audioUrl) {
    return <p className="mini">Audio playback is unavailable for this recording.</p>;
  }

  return <audio className="recording-audio" controls preload="none" src={audioUrl} onError={() => setUnavailable(true)} />;
}