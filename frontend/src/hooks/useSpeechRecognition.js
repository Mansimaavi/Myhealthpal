import { useCallback, useEffect, useRef, useState } from 'react';

const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : undefined;

const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice.',
  'no-speech': "Didn't catch anything. Tap the mic and try again.",
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection.',
};

// speech-to-text using the browser's Web Speech API
export default function useSpeechRecognition({ lang = 'en-IN', onFinal } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => () => recRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Recognition || listening) return;
    setError('');
    setInterim('');

    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text;
        else interimText += text;
      }
      setInterim(interimText);
      if (finalText) onFinalRef.current?.(finalText.trim());
    };
    rec.onerror = (event) => {
      if (event.error !== 'aborted') setError(ERROR_MESSAGES[event.error] || 'Voice input stopped unexpectedly.');
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };

    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang, listening]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported: Boolean(Recognition), listening, interim, error, start, stop };
}
