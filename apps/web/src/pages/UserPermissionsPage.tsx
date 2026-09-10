import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Spinner,
} from '../components/ui';

export function UserPermissionsPage() {
  const { id } = useParams();
  const userId = Number(id);
  const queryClient = useQueryClient();
  const [bucket, setBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const [error, setError] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => api.getUser(userId),
    enabled: Number.isInteger(userId),
  });

  const bucketsQuery = useQuery({
    queryKey: ['allowed-buckets'],
    queryFn: () => api.allowedBuckets(),
  });

  const permissionsQuery = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => api.listPermissions(userId),
    enabled: Number.isInteger(userId),
  });

  useEffect(() => {
    if (!bucket && bucketsQuery.data?.buckets[0]) {
      setBucket(bucketsQuery.data.buckets[0]);
    }
  }, [bucket, bucketsQuery.data]);

  const addMutation = useMutation({
    mutationFn: () => api.addPermission(userId, { bucket, prefix }),
    onSuccess: async () => {
      setPrefix('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (permissionId: number) => api.removePermission(userId, permissionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  if (userQuery.isLoading || permissionsQuery.isLoading) return <Spinner />;

  function onAdd(event: FormEvent) {
    event.preventDefault();
    addMutation.mutate();
  }

  const buckets = bucketsQuery.data?.buckets ?? [];

  return (
    <div>
      <PageHeader
        title="S3 Permissions"
        description={userQuery.data ? `User: ${userQuery.data.email}` : undefined}
      />

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={onAdd}>
          <div>
            <Label htmlFor="bucket">Bucket</Label>
            <select
              id="bucket"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
              value={bucket || buckets[0] || ''}
              onChange={(e) => setBucket(e.target.value)}
              required
            >
              {(bucket ? buckets : buckets).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="prefix">Prefix</Label>
            <Input
              id="prefix"
              placeholder="client-a/"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={addMutation.isPending}
              onClick={() => {
                if (!bucket && buckets[0]) setBucket(buckets[0]);
              }}
            >
              Add permission
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Card>

      {!permissionsQuery.data?.items.length ? (
        <EmptyState
          title="No permissions"
          description="Assign a bucket and prefix so this user can browse files."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Bucket</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {permissionsQuery.data.items.map((permission) => (
                <tr key={permission.id}>
                  <td className="px-4 py-3 font-mono text-xs">{permission.bucket}</td>
                  <td className="px-4 py-3 font-mono text-xs">{permission.prefix || '(bucket root)'}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="danger"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(permission.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link className="mt-6 inline-block text-sm text-ink-muted hover:text-ink" to={`/admin/users/${userId}`}>
        ← Back to user
      </Link>
    </div>
  );
}
