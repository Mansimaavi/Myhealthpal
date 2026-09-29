import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(user.medicalHistory || '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = params.get('next');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const updated = await api(`/users/${user._id}/medical-history`, {
        method: 'PATCH',
        body: { medicalHistory: history },
      });
      setUser(updated);
      if (next === 'diagnosis') {
        const session = await api('/sessions', { method: 'POST' });
        navigate(`/chat/${session._id}`);
      } else {
        setStatus('Saved.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="narrow">
      <h1>{params.get('welcome') ? `Hi ${user.firstName}, one more step` : 'Your health background'}</h1>
      <p className="lede">
        Before a symptom check, it helps to know your history. Include ongoing conditions, medicines
        you take, and allergies. Write "none" if there's nothing to add.
      </p>
      <form onSubmit={save} className="form">
        <label>
          Medical history
          <textarea rows={7} maxLength={5000} value={history} onChange={e => setHistory(e.target.value)}
            placeholder="For example: asthma since childhood, take an inhaler when needed. Allergic to penicillin." />
          <span className="hint">{history.length}/5000</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {status && <p className="success" role="status">{status}</p>}
        <div className="actions">
          <button className="button" disabled={busy || !history.trim()}>
            {busy ? 'Saving…' : next === 'diagnosis' ? 'Save and start symptom check' : 'Save history'}
          </button>
          {params.get('welcome') && (
            <button type="button" className="button button--quiet" onClick={() => navigate('/')}>Skip for now</button>
          )}
        </div>
      </form>
      <dl className="facts">
        <div><dt>Name</dt><dd>{user.firstName} {user.lastName}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Age</dt><dd>{user.age}</dd></div>
      </dl>
    </section>
  );
}
