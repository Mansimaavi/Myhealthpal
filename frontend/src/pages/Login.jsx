import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // set while submitting so the redirect below doesn't win over our own navigate()
  const submitting = useRef(false);

  if (user && !submitting.current) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    submitting.current = true;
    try {
      await login(form.email, form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      submitting.current = false;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="narrow">
      <h1>Welcome back</h1>
      <p className="lede">Log in to continue your conversations.</p>
      <form onSubmit={submit} className="form" noValidate>
        <label>
          Email
          <input type="email" autoComplete="email" required value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="aside">New here? <Link to="/register">Create an account</Link></p>
    </section>
  );
}
