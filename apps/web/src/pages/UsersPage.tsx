import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@portal/types';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Spinner,
} from '../components/ui';
import { formatDate } from '../utils';
import { creatableRoles } from '../utils/roles';

export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const roleOptions = useMemo(
    () => (user ? creatableRoles(user.role) : (['VIEWER'] as UserRole[])),
    [user],
  );
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'VIEWER' as UserRole,
  });
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin-users', q],
    queryFn: () => api.listUsers({ page: 1, pageSize: 50, q: q || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: async () => {
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'VIEWER' });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enable }: { id: number; enable: boolean }) =>
      enable ? api.enableUser(id) : api.disableUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description={
          user?.role === 'MANAGER'
            ? 'Create and manage viewer accounts and their file permissions.'
            : 'Create accounts and manage access.'
        }
        actions={
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Close' : 'Create user'}
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {showCreate ? (
        <Card className="mb-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as UserRole }))
                }
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            {error ? <p className="text-sm text-danger md:col-span-2">{error}</p> : null}
            <div className="md:col-span-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {usersQuery.isLoading ? <Spinner /> : null}
      {usersQuery.data && usersQuery.data.items.length === 0 ? (
        <EmptyState title="No users" description="Create the first user to get started." />
      ) : null}

      {usersQuery.data && usersQuery.data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {usersQuery.data.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">
                    <Badge>{row.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.isActive ? 'success' : 'danger'}>
                      {row.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{row.permissions?.length ?? 0}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="text-accent hover:underline" to={`/admin/users/${row.id}`}>
                        Edit
                      </Link>
                      <Link
                        className="text-accent hover:underline"
                        to={`/admin/users/${row.id}/permissions`}
                      >
                        Permissions
                      </Link>
                      <button
                        type="button"
                        className="text-ink-muted hover:text-ink"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({ id: row.id, enable: !row.isActive })
                        }
                      >
                        {row.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="text-danger hover:underline"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${row.email}? This cannot be undone.`,
                            )
                          ) {
                            deleteMutation.mutate(row.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {error && !showCreate ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
