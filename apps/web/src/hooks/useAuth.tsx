import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthMeResponse, S3PermissionPublic, UserPublic } from '@portal/types';
import { api, ApiError } from '../api/client';

interface AuthState {
  user: UserPublic | null;
  permissions: S3PermissionPublic[];
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthMeResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [permissions, setPermissions] = useState<S3PermissionPublic[]>([]);
  const [loading, setLoading] = useState(true);

  const applyMe = useCallback((me: AuthMeResponse) => {
    setUser(me.user);
    setPermissions(me.permissions);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      applyMe(me);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setPermissions([]);
      } else {
        setUser(null);
        setPermissions([]);
      }
    }
  }, [applyMe]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const me = await api.login(email, password);
      applyMe(me);
      return me;
    },
    [applyMe],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setPermissions([]);
    }
  }, []);

  const value = useMemo(
    () => ({ user, permissions, loading, login, logout, refresh }),
    [user, permissions, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
