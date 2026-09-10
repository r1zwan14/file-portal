import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
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

export function UsersPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'VIEWER' as 'ADMIN' | 'VIEWER',
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

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create accounts and manage access."
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
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as 'ADMIN' | 'VIEWER' }))
                }
              >
                <option value="VIEWER">VIEWER</option>
                <option value="ADMIN">ADMIN</option>
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
              {usersQuery.data.items.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge>{user.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={user.isActive ? 'success' : 'danger'}>
                      {user.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{user.permissions?.length ?? 0}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="text-accent hover:underline" to={`/admin/users/${user.id}`}>
                        Edit
                      </Link>
                      <Link
                        className="text-accent hover:underline"
                        to={`/admin/users/${user.id}/permissions`}
                      >
                        Permissions
                      </Link>
                      <button
                        type="button"
                        className="text-ink-muted hover:text-ink"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({ id: user.id, enable: !user.isActive })
                        }
                      >
                        {user.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
