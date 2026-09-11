import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { FilesPage } from '../pages/FilesPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { UsersPage } from '../pages/UsersPage';
import { UserDetailPage } from '../pages/UserDetailPage';
import { UserPermissionsPage } from '../pages/UserPermissionsPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../utils/roles';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathForRole(user.role)} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/files/*" element={<FilesPage />} />
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id" element={<UserDetailPage />} />
            <Route path="/admin/users/:id/permissions" element={<UserPermissionsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
