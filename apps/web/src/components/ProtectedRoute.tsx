import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '@portal/types';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({
  roles,
}: {
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        Loading session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
