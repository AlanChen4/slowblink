# 0001 — UUIDv4 for new local table IDs

**Date:** 2026-05-04
**Status:** Accepted

## Context

The local SQLite DB historically uses `INTEGER PRIMARY KEY` for `samples.id`. The remote Postgres schema uses UUIDs throughout — `public.samples.id uuid default gen_random_uuid()`, `public.profiles.id` from auth, etc. The wire-format `client_id` on the remote currently mirrors the local INTEGER stringified, which is the only point where the two ID systems meet.

When adding a new local table (`dev_captures`) for the Replay feature, we needed a primary-key convention that:

1. Avoids the wire-format mismatch the existing `INTEGER` ↔ `TEXT(numeric)` boundary creates.
2. Lets us name JPEG files on disk by row id (`<id>.jpg`) without exposing autoincrement enumeration.
3. Stays consistent with where the remote schema already lives.

## Decision

New local SQLite table primary keys are **UUIDv4** as `TEXT`, generated client-side via Node's `crypto.randomUUID()`.

**Scope: convention going forward.** Existing `samples.id` stays INTEGER. The wire-format `client_id` flow is unchanged. Migrating `samples.id` to UUID is intentionally not in scope here — it would touch sync semantics, IPC types, and renderer code, with no immediate benefit.

## Alternatives considered

- **UUIDv7 (time-ordered).** Lexicographically sorts by creation time, so directory listings would be chronological. Rejected because the viewer queries `ORDER BY captured_at`, which gives correct ordering regardless of id format, and v7 doesn't match the remote's `gen_random_uuid()` which is v4. Matching the remote convention won.
- **BLOB UUIDs (16 bytes).** More compact than TEXT (37 bytes for the dashed form). Rejected because SQLite has no native UUID display, BLOBs are awkward to inspect from the CLI, and the storage delta is negligible at slowblink's scale.
- **INTEGER autoincrement.** Consistent with existing `samples`, but would force JPEG filenames to expose row numbering and would re-create the local-vs-remote mismatch the new table was free to avoid.

## Consequences

- **Filesystem listings of `<uuid>.jpg` are not chronological.** Mitigated: the replay viewer queries `ORDER BY captured_at DESC`, so the UI never depends on filename order.
- **Storage cost is ~37 bytes per id** versus 8 for INTEGER. At expected scale (a few thousand dev captures during debugging sessions), the delta is in the kilobytes.
- **Future tables follow this convention by default.** New local tables should use TEXT PK with `crypto.randomUUID()` unless there's a specific reason to deviate.
