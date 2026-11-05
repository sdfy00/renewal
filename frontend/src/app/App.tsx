import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthContext } from '@/entities/user/model/AuthContext';
import type { AuthUser } from '@/entities/user/model/types';
import Navbar from '@/widgets/navbar/ui/Navbar';
import LoginPage from '@/pages/login/ui/LoginPage';
import HomePage from '@/pages/home/ui/HomePage';
import SpacePage from '@/pages/space/ui/SpacePage';

function loadUser(): AuthUser | null {
  try {
    const s = localStorage.getItem('user');
    return s ? (JSON.parse(s) as AuthUser) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUserState] = useState<AuthUser | null>(loadUser);

  function setUser(u: AuthUser | null) {
    setUserState(u);
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        {user && <Navbar />}
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/"
            element={user ? <HomePage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/spaces/:slug"
            element={user ? <SpacePage /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
