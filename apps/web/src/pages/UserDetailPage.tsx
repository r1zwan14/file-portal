import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button, Card, Input, Label, PageHeader, Spinner } from '../components/ui';

export function UserDetailPage() {
  const { id } = useParams();
  const userId = Number(id);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => api.getUser(userId),
    enabled: Number.isInteger(userId),
  });

  useEffect(() => {
    if (!userQuery.data) return;
    setName(userQuery.data.name);
    setEmail(userQuery.data.email);
    setRole(userQuery.data.role);
  }, [userQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => api.updateUser(userId, { name, email, role }),
    onSuccess: async () => {
      setMessage('User updated');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetPassword(userId, password),
    onSuccess: () => {
      setPassword('');
      setMessage('Password reset. Existing sessions were invalidated.');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  if (userQuery.isLoading) return <Spinner />;
  if (!userQuery.data) return <p className="text-danger">User not found</p>;

  function onSave(event: FormEvent) {
    event.preventDefault();
    updateMutation.mutate();
  }

  function onReset(event: FormEvent) {
    event.preventDefault();
    resetMutation.mutate();
  }

  return (
    <div>
      <PageHeader
        title={userQuery.data.name}
        description={userQuery.data.email}
        actions={
          <Link
            className="text-sm text-accent hover:underline"
            to={`/admin/users/${userId}/permissions`}
          >
            Manage permissions
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Profile</h2>
          <form className="space-y-3" onSubmit={onSave}>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as 'ADMIN' | 'VIEWER')}
              >
                <option value="VIEWER">VIEWER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <Button type="submit" disabled={updateMutation.isPending}>
              Save changes
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Reset password</h2>
          <form className="space-y-3" onSubmit={onReset}>
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="secondary" disabled={resetMutation.isPending}>
              Reset password
            </Button>
          </form>
        </Card>
      </div>

      {message ? <p className="mt-4 text-sm text-accent">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <Link className="mt-6 inline-block text-sm text-ink-muted hover:text-ink" to="/admin/users">
        ← Back to users
      </Link>
    </div>
  );
}
