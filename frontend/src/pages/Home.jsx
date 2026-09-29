import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

const TYPE_NAMES = {
  MENTAL_HEALTH_THERAPIST: 'Talk it through',
  DIAGNOSIS: 'Symptom check',
};

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');

  useEffect(() => {
    api('/sessions').then(setSessions).catch(err => setError(err.message));
  }, []);

  const start = async (type) => {
    if (type === 'diagnosis' && !user.hasFilledWaitingRoom) {
      navigate('/profile?next=diagnosis');
      return;
    }
    setStarting(type);
    setError('');
    try {
      const session = await api(type === 'therapy' ? '/sessions/therapy' : '/sessions', { method: 'POST' });
      navigate(`/chat/${session._id}`);
    } catch (err) {
      setError(err.message);
      setStarting('');
    }
  };

  return (
    <section className="home">
      <h1 className="greeting">How are you feeling today, {user.firstName}?</h1>

      <div className="choices">
        <button className="choice" onClick={() => start('therapy')} disabled={!!starting}>
          <span className="choice__title">{starting === 'therapy' ? 'Starting…' : 'Talk it through'}</span>
          <span className="choice__text">
            A supportive conversation about what's on your mind: stress, worry, low mood, or anything else.
          </span>
        </button>
        <button className="choice" onClick={() => start('diagnosis')} disabled={!!starting}>
          <span className="choice__title">{starting === 'diagnosis' ? 'Starting…' : 'Check a symptom'}</span>
          <span className="choice__text">
            Describe what you're experiencing. You'll be asked a few questions and told if it needs a doctor.
          </span>
        </button>
      </div>

      <p className="disclaimer">
        MyHealthPal gives general information, not a medical diagnosis. It doesn't replace a doctor or therapist.
      </p>

      {error && <p className="error" role="alert">{error}</p>}

      <h2>Past conversations</h2>
      {sessions === null && !error && <p className="muted">Loading…</p>}
      {sessions?.length === 0 && <p className="muted">Your conversations will appear here once you start one.</p>}
      {sessions?.length > 0 && (
        <ul className="history">
          {sessions.map(s => (
            <li key={s._id}>
              <Link to={`/chat/${s._id}`}>
                <span>{TYPE_NAMES[s.sessionType] || 'Conversation'}</span>
                <span className="muted">{formatDate(s.startTime)}{s.completed ? ', ended' : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
