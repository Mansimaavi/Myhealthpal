import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import MicButton from '../components/MicButton';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useSpeechSynthesis from '../hooks/useSpeechSynthesis';

const MEDICAL_ATTENTION = 'This issue requires medical attention';
const READ_ALOUD_KEY = 'mhp_read_aloud';

export default function Chat() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [readAloud, setReadAloud] = useState(() => localStorage.getItem(READ_ALOUD_KEY) === '1');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const tts = useSpeechSynthesis();
  const stt = useSpeechRecognition({
    onFinal: (text) => setDraft(d => (d ? `${d} ${text}` : text)),
  });

  const isTherapy = session?.sessionType === 'MENTAL_HEALTH_THERAPIST';

  useEffect(() => {
    setLoadError('');
    Promise.all([api(`/sessions/${sessionId}`), api(`/messages/session/${sessionId}`)])
      .then(([s, m]) => { setSession(s); setMessages(m); })
      .catch(err => setLoadError(err.message));
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    localStorage.setItem(READ_ALOUD_KEY, readAloud ? '1' : '0');
    if (!readAloud) tts.stop();
  }, [readAloud, tts.stop]);

  const send = async (e) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    stt.stop();
    setSending(true);
    setError('');

    const pending = { _id: `pending-${Date.now()}`, sender: 'user', content, pending: true };
    setMessages(m => [...m, pending]);
    setDraft('');

    try {
      const path = isTherapy ? `/messages/therapy/${sessionId}` : `/messages/${sessionId}`;
      const { userMessage, gptResponse } = await api(path, { method: 'POST', body: { content } });
      setMessages(m => [...m.filter(x => x._id !== pending._id), userMessage, gptResponse]);
      if (readAloud) tts.speak(gptResponse.content, gptResponse._id);
    } catch (err) {
      // the user message may have been saved even if the reply failed, so reload the history
      const fresh = await api(`/messages/session/${sessionId}`).catch(() => null);
      setMessages(fresh || (m => m.filter(x => x._id !== pending._id)));
      if (!fresh) setDraft(content);
      setError(err.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const endSession = async () => {
    try {
      const updated = await api(`/sessions/${sessionId}`, {
        method: 'PUT',
        body: { completed: true, endTime: new Date().toISOString() },
      });
      setSession(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loadError) {
    return (
      <section className="narrow">
        <h1>Conversation not found</h1>
        <p className="error">{loadError}</p>
        <Link to="/">Back to home</Link>
      </section>
    );
  }
  if (!session) return <p className="muted">Loading conversation…</p>;

  return (
    <section className="chat">
      <div className="chat__header">
        <h1>{isTherapy ? 'Talk it through' : 'Symptom check'}</h1>
        <div className="chat__tools">
          {tts.supported && (
            <label className="toggle">
              <input type="checkbox" checked={readAloud} onChange={e => setReadAloud(e.target.checked)} />
              Read replies aloud
            </label>
          )}
          {!session.completed && (
            <button className="button button--quiet" onClick={endSession}>End conversation</button>
          )}
        </div>
      </div>

      <ol className="messages" aria-live="polite">
        {messages.length === 0 && (
          <li className="empty">
            {isTherapy
              ? "Share whatever is on your mind. There's no right way to start."
              : 'Describe your symptom: what it feels like, where, and since when.'}
          </li>
        )}
        {messages.map(m => {
          const mine = m.sender === 'user';
          const needsDoctor = !mine && m.content.includes(MEDICAL_ATTENTION);
          return (
            <li key={m._id} className={`message ${mine ? 'message--mine' : 'message--theirs'} ${m.pending ? 'message--pending' : ''}`}>
              <p className="message__text">{m.content}</p>
              {mine && m.emotion && <span className="message__meta">Detected mood: {m.emotion}</span>}
              {!mine && tts.supported && (
                <button className="link-button message__speak"
                  onClick={() => (tts.speakingId === m._id ? tts.stop() : tts.speak(m.content, m._id))}>
                  {tts.speakingId === m._id ? 'Stop' : 'Listen'}
                </button>
              )}
              {needsDoctor && (
                <Link to="/providers" className="button button--small">Find doctors near you</Link>
              )}
            </li>
          );
        })}
        {sending && <li className="message message--theirs message--typing" aria-label="Writing a reply">…</li>}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {error && <p className="error" role="alert">{error}</p>}

      {session.completed ? (
        <p className="muted ended">This conversation has ended. <Link to="/">Start a new one</Link></p>
      ) : (
        <form className="composer" onSubmit={send}>
          {stt.supported && (
            <MicButton listening={stt.listening} onStart={stt.start} onStop={stt.stop} disabled={sending} />
          )}
          <div className="composer__field">
            <textarea
              ref={inputRef}
              rows={2}
              maxLength={5000}
              value={stt.listening && stt.interim ? `${draft} ${stt.interim}`.trim() : draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
              placeholder={stt.listening ? 'Listening…' : 'Type or tap the mic to speak'}
              aria-label="Your message"
              readOnly={stt.listening}
            />
            {stt.error && <span className="hint error-text">{stt.error}</span>}
            {!stt.supported && <span className="hint">Voice input isn't supported in this browser. Try Chrome or Edge.</span>}
          </div>
          <button className="button" disabled={sending || !draft.trim()}>Send</button>
        </form>
      )}
    </section>
  );
}
