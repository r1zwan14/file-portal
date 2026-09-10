import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, ScrollText, Users } from 'lucide-react';
import { api } from '../api/client';
import { Card, PageHeader, Spinner } from '../components/ui';

export function AdminDashboardPage() {
  const usersQuery = useQuery({
    queryKey: ['admin-users-summary'],
    queryFn: () => api.listUsers({ page: 1, pageSize: 5 }),
  });
  const auditQuery = useQuery({
    queryKey: ['admin-audit-summary'],
    queryFn: () => api.listAuditLogs({ page: 1, pageSize: 5 }),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Manage users, permissions, and review access activity."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center gap-2 text-accent">
            <Users className="size-5" />
            <h2 className="font-semibold">Users</h2>
          </div>
          {usersQuery.isLoading ? (
            <Spinner />
          ) : (
            <p className="text-3xl font-semibold">{usersQuery.data?.total ?? 0}</p>
          )}
          <Link className="mt-3 inline-block text-sm text-accent hover:underline" to="/admin/users">
            Manage users
          </Link>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2 text-accent">
            <FileText className="size-5" />
            <h2 className="font-semibold">Files</h2>
          </div>
          <p className="text-sm text-ink-muted">Browse configured S3 content (read-only).</p>
          <Link className="mt-3 inline-block text-sm text-accent hover:underline" to="/files">
            Open file browser
          </Link>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2 text-accent">
            <ScrollText className="size-5" />
            <h2 className="font-semibold">Recent activity</h2>
          </div>
          {auditQuery.isLoading ? (
            <Spinner />
          ) : (
            <ul className="space-y-2 text-sm">
              {(auditQuery.data?.items ?? []).slice(0, 3).map((item) => (
                <li key={item.id} className="text-ink-muted">
                  <span className="font-medium text-ink">{item.action}</span>
                  {item.userEmail ? ` · ${item.userEmail}` : ''}
                </li>
              ))}
            </ul>
          )}
          <Link
            className="mt-3 inline-block text-sm text-accent hover:underline"
            to="/admin/audit-logs"
          >
            View audit logs
          </Link>
        </Card>
      </div>
    </div>
  );
}
