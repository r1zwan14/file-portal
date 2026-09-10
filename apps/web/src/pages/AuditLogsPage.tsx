import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { EmptyState, Input, PageHeader, Spinner } from '../components/ui';
import { formatDate } from '../utils';

export function AuditLogsPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const logsQuery = useQuery({
    queryKey: ['audit-logs', q, action, page],
    queryFn: () =>
      api.listAuditLogs({
        page,
        pageSize: 25,
        q: q || undefined,
        action: action || undefined,
      }),
  });

  const totalPages = logsQuery.data
    ? Math.max(1, Math.ceil(logsQuery.data.total / logsQuery.data.pageSize))
    : 1;

  return (
    <div>
      <PageHeader title="Audit Logs" description="Security and access activity." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search user, bucket, or key"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        >
          <option value="">All actions</option>
          {[
            'LOGIN',
            'LOGOUT',
            'DOWNLOAD',
            'LIST',
            'CREATE_USER',
            'UPDATE_USER',
            'DISABLE_USER',
            'ENABLE_USER',
            'PASSWORD_RESET',
            'ADD_PERMISSION',
            'REMOVE_PERMISSION',
          ].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {logsQuery.isLoading ? <Spinner /> : null}
      {logsQuery.data && logsQuery.data.items.length === 0 ? (
        <EmptyState title="No audit logs" description="Activity will appear here." />
      ) : null}

      {logsQuery.data && logsQuery.data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line bg-surface text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Bucket</th>
                  <th className="px-4 py-3 font-medium">Object / Key</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logsQuery.data.items.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-ink-muted">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3">{log.userEmail ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.bucket ?? '—'}</td>
                    <td className="max-w-xs truncate px-4 py-3 font-mono text-xs">
                      {log.objectKey ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-ink-muted disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="text-ink-muted disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
