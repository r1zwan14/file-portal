import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, LayoutDashboard, LogOut, Moon, ScrollText, Sun, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Button } from '../components/ui';
import { cn } from '../utils';
import {
  canAccessAdminDashboard,
  canManageUsers,
  canViewAuditLogs,
} from '../utils/roles';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { resolved, toggle, preference, setPreference } = useTheme();
  const navigate = useNavigate();

  const links = [
    ...(user && canAccessAdminDashboard(user.role)
      ? [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }]
      : []),
    { to: '/files', label: 'Files', icon: FileText },
    ...(user && canManageUsers(user.role)
      ? [{ to: '/admin/users', label: 'Users', icon: Users }]
      : []),
    ...(user && canViewAuditLogs(user.role)
      ? [{ to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText }]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/80 bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
              FP
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">File Portal</p>
              <p className="text-xs text-ink-muted">Secure file sharing</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={
                preference === 'system'
                  ? `Theme: system (${resolved}). Click to override.`
                  : `Theme: ${preference}. Right-click to use system.`
              }
              onClick={toggle}
              onContextMenu={(event) => {
                event.preventDefault();
                setPreference('system');
              }}
            >
              {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-ink-muted">
                {user?.email}
                {user?.role ? ` · ${user.role}` : ''}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-xl border border-line bg-panel p-2">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface hover:text-ink',
                    isActive && 'bg-accent-soft text-accent',
                  )
                }
              >
                <link.icon className="size-4" />
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
