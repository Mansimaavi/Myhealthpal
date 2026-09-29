import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand">MyHealthPal</Link>
        {user && (
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/providers">Find care</NavLink>
            <NavLink to="/profile">Profile</NavLink>
            <button className="link-button" onClick={() => { logout(); navigate('/login'); }}>
              Log out
            </button>
          </nav>
        )}
      </header>

      <main id="main" className="main">
        <Outlet />
      </main>

      <footer className="helpline" role="note">
        Struggling right now? Call Tele-MANAS on <a href="tel:14416">14416</a> or{' '}
        <a href="tel:18008914416">1-800-891-4416</a>, free and open 24/7. In an emergency, call{' '}
        <a href="tel:112">112</a>.
      </footer>
    </div>
  );
}
