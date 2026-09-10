/**
 * Normalize an S3 prefix for consistent comparisons.
 * Empty string means bucket root.
 */
export function normalizePrefix(prefix: string): string {
  let value = prefix.trim();
  if (!value) return '';
  if (value.startsWith('/')) value = value.slice(1);
  value = value.replace(/\\/g, '/');
  if (value.includes('..')) {
    throw new Error('Invalid prefix');
  }
  if (!value.endsWith('/')) value = `${value}/`;
  return value;
}

export function normalizeKey(key: string): string {
  let value = key.trim();
  if (!value) throw new Error('Key is required');
  if (value.startsWith('/')) value = value.slice(1);
  value = value.replace(/\\/g, '/');
  if (value.includes('..')) {
    throw new Error('Invalid key');
  }
  return value;
}

export function isKeyWithinPrefix(key: string, prefix: string): boolean {
  const normalizedKey = normalizeKey(key);
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) {
    // Empty prefix grants access to the entire bucket (typically admin-assigned).
    return true;
  }
  return normalizedKey.startsWith(normalizedPrefix) || normalizedKey + '/' === normalizedPrefix;
}

export function isPrefixWithinAllowed(requestedPrefix: string, allowedPrefix: string): boolean {
  const requested = normalizePrefix(requestedPrefix);
  const allowed = normalizePrefix(allowedPrefix);

  if (!allowed) return true;
  if (!requested) return false;

  return requested.startsWith(allowed) || allowed.startsWith(requested);
}

export function canListWithinPermission(requestedPrefix: string, allowedPrefix: string): boolean {
  const requested = normalizePrefix(requestedPrefix);
  const allowed = normalizePrefix(allowedPrefix);

  // Empty allowed prefix = entire bucket
  if (!allowed) return true;

  // Listing at root or a parent of the allowed prefix is OK (UI shows only allowed folders),
  // but actual object access is still constrained by isKeyWithinPrefix.
  if (!requested) return true;

  return requested.startsWith(allowed) || allowed.startsWith(requested);
}

export function fileNameFromKey(key: string): string {
  const parts = key.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? key;
}

export function folderNameFromPrefix(prefix: string): string {
  const parts = normalizePrefix(prefix).split('/').filter(Boolean);
  return parts[parts.length - 1] ?? prefix;
}
