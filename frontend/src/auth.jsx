import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const AuthContext = createContext(null);

const USER_KEY = 'mhp_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return getToken() ? JSON.parse(localStorage.getItem(USER_KEY)) : null;
    } catch {
      return null;
    }
  });

  const saveUser = useCallback((u) => {
    setUser(u);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    saveUser(null);
  }, [saveUser]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  // refresh the stored profile once on load in case it changed elsewhere
  useEffect(() => {
    if (user?._id && getToken()) {
      api(`/users/${user._id}`).then(saveUser).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const { user: u, token } = await api('/users/login', { method: 'POST', body: { email, password } });
    setToken(token);
    saveUser(u);
  };

  const register = async (form) => {
    const { user: u, token } = await api('/users', { method: 'POST', body: form });
    setToken(token);
    saveUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, setUser: saveUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
