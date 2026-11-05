import { createContext, useContext } from 'react';
import type { AuthUser } from './types';

interface AuthCtx {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {} });

export const useAuth = () => useContext(AuthContext);
