import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('dkc_token'));
  const [role, setRole] = useState(localStorage.getItem('dkc_role'));
  const [user, setUser] = useState(null);

  const login = useCallback((tok, userRole, userObj) => {
    localStorage.setItem('dkc_token', tok);
    localStorage.setItem('dkc_role', userRole);
    setToken(tok);
    setRole(userRole);
    setUser(userObj || null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('dkc_token');
    localStorage.removeItem('dkc_role');
    setToken(null);
    setRole(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, role, user, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
