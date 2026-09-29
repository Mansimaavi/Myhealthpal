import { useState } from 'react';
import { api } from '../api';

const KIND_NAMES = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  doctors: 'Doctor',
  doctor: 'Doctor',
  psychotherapist: 'Psychotherapist',
  counselling: 'Counselling',
};

const directionsUrl = (p) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;

const GEO_ERRORS = {
  1: 'Location access is blocked. Allow it in your browser settings, then try again.',
  2: "Your location couldn't be found. Check that location services are on.",
  3: 'Finding your location took too long. Try again.',
};

function ProviderItem({ p }) {
  return (
    <li className="provider">
      <div className="provider__head">
        <h3>{p.name}</h3>
        <span className="provider__distance">{p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`}</span>
      </div>
      <p className="muted">
        {p.featured ? 'MyHealthPal listed' : KIND_NAMES[p.kind] || 'Healthcare'}
        {p.speciality ? `, ${p.speciality.replaceAll(';', ', ')}` : ''}
        {p.mentalHealth ? ', mental health' : ''}
      </p>
      {p.address && <p>{p.address}</p>}
      {p.openingHours && <p className="muted">Hours: {p.openingHours}</p>}
      <div className="provider__actions">
        <a className="button button--small" href={directionsUrl(p)} target="_blank" rel="noreferrer">Get directions</a>
        {p.phone && <a className="button button--small button--quiet" href={`tel:${p.phone.split(';')[0].trim()}`}>Call</a>}
        {p.website && <a className="link-button" href={p.website} target="_blank" rel="noreferrer">Website</a>}
      </div>
    </li>
  );
}

export default function Providers() {
  const [radius, setRadius] = useState('5');
  const [mentalHealthOnly, setMentalHealthOnly] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | locating | loading | done | error
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);

  const search = () => {
    if (!navigator.geolocation) {
      setStatus('error');
      setError("This browser can't share your location.");
      return;
    }
    setStatus('locating');
    setError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setStatus('loading');
        const q = `latitude=${coords.latitude}&longitude=${coords.longitude}`;
        try {
          const [featured, discovered] = await Promise.all([
            api(`/healthcare-places/nearby?${q}&maxDistance=${radius}`).catch(() => []),
            api(`/healthcare-places/discover?${q}&radius=${radius}${mentalHealthOnly ? '&mentalHealth=true' : ''}`),
          ]);
          setResults([
            ...featured.map(p => ({ ...p, id: p._id, featured: true })),
            ...discovered,
          ]);
          setStatus('done');
        } catch (err) {
          setError(err.message);
          setStatus('error');
        }
      },
      (err) => {
        setError(GEO_ERRORS[err.code] || 'Your location could not be found.');
        setStatus('error');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const busy = status === 'locating' || status === 'loading';

  return (
    <section className="providers">
      <h1>Find care near you</h1>
      <p className="lede">
        Hospitals, clinics, doctors and counsellors around your current location.
      </p>

      <div className="filters">
        <label>
          Within
          <select value={radius} onChange={e => setRadius(e.target.value)}>
            <option value="2">2 km</option>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
            <option value="20">20 km</option>
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={mentalHealthOnly} onChange={e => setMentalHealthOnly(e.target.checked)} />
          Mental health only
        </label>
        <button className="button" onClick={search} disabled={busy}>
          {status === 'locating' ? 'Finding your location…' : status === 'loading' ? 'Searching…' : 'Search near me'}
        </button>
      </div>

      {status === 'error' && <p className="error" role="alert">{error}</p>}
      {status === 'done' && results.length === 0 && (
        <p className="muted">
          Nothing found within {radius} km.{' '}
          {mentalHealthOnly ? 'Turn off "Mental health only" or try a larger distance.' : 'Try a larger distance.'}
        </p>
      )}
      {results.length > 0 && (
        <>
          <p className="muted" role="status">{results.length} places found</p>
          <ul className="provider-list">
            {results.map(p => <ProviderItem key={p.id} p={p} />)}
          </ul>
        </>
      )}
      <p className="attribution">
        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.
        Check opening hours with the provider before visiting.
      </p>
    </section>
  );
}
