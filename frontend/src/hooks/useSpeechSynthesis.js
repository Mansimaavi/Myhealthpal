import { useCallback, useEffect, useState } from 'react';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

const pickVoice = () => {
  const voices = synth?.getVoices() || [];
  return voices.find(v => v.lang === 'en-IN')
    || voices.find(v => v.lang?.startsWith('en') && v.localService)
    || voices.find(v => v.lang?.startsWith('en'))
    || null;
};

// text-to-speech using the browser's Web Speech API
export default function useSpeechSynthesis() {
  const [speakingId, setSpeakingId] = useState(null);

  useEffect(() => () => synth?.cancel(), []);

  const speak = useCallback((text, id = 'default') => {
    if (!synth || !text) return;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onend = () => setSpeakingId(current => (current === id ? null : current));
    utterance.onerror = utterance.onend;

    setSpeakingId(id);
    synth.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    synth?.cancel();
    setSpeakingId(null);
  }, []);

  return { supported: Boolean(synth), speakingId, speak, stop };
}
