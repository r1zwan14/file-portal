import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, FileIcon, Folder, Search } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
} from '../components/ui';
import { formatBytes, formatDate } from '../utils';

export function FilesPage() {
  const { user, permissions } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const bucket = params.get('bucket') ?? undefined;
  const prefix = params.get('prefix') ?? '';
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [activeSearch, setActiveSearch] = useState(params.get('search') ?? '');

  const rootsQuery = useQuery({
    queryKey: ['file-roots'],
    queryFn: () => api.fileRoots(),
  });

  useEffect(() => {
    if (bucket || !rootsQuery.data?.roots.length) return;
    const first = rootsQuery.data.roots[0]!;
    setParams({
      bucket: first.bucket,
      ...(first.prefix ? { prefix: first.prefix } : {}),
    });
  }, [bucket, rootsQuery.data, setParams]);

  const listQuery = useQuery({
    queryKey: ['files', bucket, prefix, activeSearch],
    queryFn: () =>
      api.listFiles({
        bucket,
        prefix,
        search: activeSearch || undefined,
      }),
    enabled: Boolean(bucket),
  });

  const downloadMutation = useMutation({
    mutationFn: (key: string) => api.download({ bucket, key }),
    onSuccess: (data) => {
      window.open(data.url, '_blank', 'noopener,noreferrer');
    },
  });

  const crumbs = useMemo(() => {
    const parts = prefix.split('/').filter(Boolean);
    const items = [{ label: 'Home', prefix: '' }];
    let current = '';
    for (const part of parts) {
      current += `${part}/`;
      items.push({ label: part, prefix: current });
    }
    return items;
  }, [prefix]);

  if (!permissions.length && user?.role === 'VIEWER') {
    return (
      <div>
        <PageHeader title="Your Files" description={`Welcome, ${user.name}`} />
        <EmptyState
          title="No files available"
          description="You do not have any folder permissions yet. Contact an administrator."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={user?.role === 'ADMIN' ? 'Files' : 'Your Files'}
        description={
          user?.role === 'ADMIN'
            ? 'Browse configured bucket content (read-only).'
            : `Welcome, ${user?.name}`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(rootsQuery.data?.roots ?? []).map((root) => {
          const active =
            root.bucket === bucket && (prefix === root.prefix || (!prefix && !root.prefix));
          return (
            <button
              key={`${root.bucket}:${root.prefix}`}
              type="button"
              onClick={() =>
                setParams({
                  bucket: root.bucket,
                  ...(root.prefix ? { prefix: root.prefix } : {}),
                })
              }
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-panel text-ink-muted hover:text-ink'
              }`}
            >
              {root.label}
            </button>
          );
        })}
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setActiveSearch(search.trim());
          const next = new URLSearchParams(params);
          if (search.trim()) next.set('search', search.trim());
          else next.delete('search');
          setParams(next);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" />
          <Input
            className="pl-9"
            placeholder="Search files in your permitted folders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {crumbs.map((crumb, index) => (
          <span key={crumb.prefix + index} className="inline-flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5" /> : null}
            <button
              type="button"
              className="hover:text-accent"
              onClick={() => {
                setActiveSearch('');
                setSearch('');
                const next = new URLSearchParams();
                if (bucket) next.set('bucket', bucket);
                if (crumb.prefix) next.set('prefix', crumb.prefix);
                setParams(next);
              }}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {listQuery.isLoading ? <Spinner label="Loading files…" /> : null}
      {listQuery.isError ? (
        <EmptyState
          title="Unable to load files"
          description="Check your connection and try again."
        />
      ) : null}

      {listQuery.data ? (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          {!listQuery.data.folders.length && !listQuery.data.files.length ? (
            <div className="p-6">
              <EmptyState
                title={activeSearch ? 'No search results' : 'No files'}
                description={
                  activeSearch
                    ? 'Try a different search term.'
                    : 'This folder is empty.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {listQuery.data.folders.map((folder) => (
                <li key={folder.prefix}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
                    onClick={() => {
                      setActiveSearch('');
                      setSearch('');
                      const next = new URLSearchParams();
                      if (bucket) next.set('bucket', bucket);
                      next.set('prefix', folder.prefix);
                      setParams(next);
                    }}
                  >
                    <Folder className="size-5 text-accent" />
                    <div>
                      <p className="font-medium">{folder.name}</p>
                      <p className="text-xs text-ink-muted">Folder</p>
                    </div>
                  </button>
                </li>
              ))}
              {listQuery.data.files.map((file) => (
                <li key={file.key} className="flex items-center gap-3 px-4 py-3">
                  <FileIcon className="size-5 text-ink-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-xs text-ink-muted">
                      {formatBytes(file.size)} · {formatDate(file.lastModified)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate(file.key)}
                  >
                    <Download className="size-4" />
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {listQuery.data.nextCursor ? (
            <div className="border-t border-line px-4 py-3">
              <Badge>More results available — refine your prefix or search</Badge>
            </div>
          ) : null}
        </div>
      ) : null}

      {user?.role === 'VIEWER' && !bucket ? (
        <Button variant="ghost" onClick={() => navigate('/files')}>
          Refresh
        </Button>
      ) : null}

      <div className="sr-only">
        <Link to="/">home</Link>
      </div>
    </div>
  );
}
