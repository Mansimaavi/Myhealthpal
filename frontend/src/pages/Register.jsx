import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const EMPTY = { firstName: '', lastName: '', email: '', password: '', age: '', gender: '' };

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // set while submitting so the redirect below doesn't win over our own navigate()
  const submitting = useRef(false);

  if (user && !submitting.current) return <Navigate to="/" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (!form.age || Number(form.age) < 13) return setError('You need to be 13 or older to use MyHealthPal.');
    setBusy(true);
    setError('');
    submitting.current = true;
    try {
      await register({ ...form, age: Number(form.age) });
      navigate('/profile?welcome=1', { replace: true });
    } catch (err) {
      submitting.current = false;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="narrow">
      <h1>Create your account</h1>
      <p className="lede">Your conversations stay private to your account.</p>
      <form onSubmit={submit} className="form" noValidate>
        <div className="row">
          <label>First name<input required autoComplete="given-name" value={form.firstName} onChange={set('firstName')} /></label>
          <label>Last name<input required autoComplete="family-name" value={form.lastName} onChange={set('lastName')} /></label>
        </div>
        <label>Email<input type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
        <label>
          Password
          <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
          <span className="hint">At least 8 characters</span>
        </label>
        <div className="row">
          <label>Age<input type="number" min="13" max="120" required value={form.age} onChange={set('age')} /></label>
          <label>
            Gender
            <select required value={form.gender} onChange={set('gender')}>
              <option value="" disabled>Choose</option>
              <option>Female</option>
              <option>Male</option>
              <option>Non-binary</option>
              <option>Prefer not to say</option>
            </select>
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="aside">Already have an account? <Link to="/login">Log in</Link></p>
    </section>
  );
}
