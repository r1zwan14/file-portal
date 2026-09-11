-- Existing rows contain bearer session tokens. Invalidate them before the
-- application begins storing SHA-256 token digests in the same column.
DELETE FROM `sessions`;
