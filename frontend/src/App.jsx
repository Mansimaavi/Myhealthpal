import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Chat from './pages/Chat';
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Providers from './pages/Providers';
import Register from './pages/Register';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/chat/:sessionId" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/providers" element={<RequireAuth><Providers /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
