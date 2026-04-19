# Supabase dump inventory

**Source:** `~/supabase-backups/supabase-2026-04-18.dump`
**Format:** PostgreSQL custom dump (`pg_dump -Fc`), 566 KB, dumped from PG 17.4 by `pg_dump 18.3`.
**Restored into:** `timeplete_migration` database in the existing `my-postgres` Docker container (port 5432).

## Schemas in the dump

- `auth` — Supabase Auth schema, **EMPTY**. No password hashes here. Auth was Cognito.
- `public` — Application data. 28 tables (see below).
- `extensions`, `graphql`, `graphql_public`, `realtime`, `storage`, `vault`, `pgbouncer` — Supabase scaffolding. Not migrated.

## Users

- `public.users`: **31 rows** total.
  - **26 approved** (`is_approved = true`) — these are the ones we migrate.
  - **5 not approved** (`is_approved = false`) — skipped per user choice.

The five skipped accounts: `diyua@dollicons.com`, `odsnb@dollicons.com`, `la4ga@dollicons.com`, `z5mow@dollicons.com`, `tosay88557@izkat.com`.

## Public table row counts

| Table | Rows | Notes |
|---|---:|---|
| `users` | 31 | Will filter to 26 approved |
| `tags` | 12 | |
| `lists` | 102 | 24 normal + 47 goal lists + 31 inboxes |
| `list_sections` | 118 | All `list_id` and `user_id` non-null |
| `list_trackable_links` | 55 | |
| `list_shares` | 2 | both `editor` permission |
| `pending_list_invites` | 0 | |
| `trackables` | 47 | All have `list_id` (goal list) |
| `trackable_days` | 178 | |
| `trackable_shares` | 0 | |
| `tracker_entries` | 18 | |
| `tasks` | 705 | |
| `task_tags` | 4 | |
| `task_days` | 437 | |
| `task_list_ordering` | 0 | |
| `root_task_ordering` | 10 | |
| `user_task_day_order` | 112 | |
| `task_comments` | 10 | |
| `task_timers` | 2 | PK = `user_id`, max 1 row/user |
| `time_windows` | 1572 | 1461 `ACTUAL`, 111 `PLANNED` |
| `recurring_tasks` | 5 | No monthly patterns |
| `recurring_events` | 8 | No monthly patterns |
| `deleted_recurring_occurrences` | 1 | |
| `deleted_recurring_event_occurrences` | 30 | |
| `reviews` | 53 | Legacy table — schema drops this; p1 superseded by Q&A tables. **Skipped.** |
| `review_questions` | 143 | |
| `review_answers` | 266 | |
| `review_answers_duplicate` | 110 | Backup table not in schema. **Skipped.** |

## Enum value distributions (for migration mapping)

### `trackable_type` × `frequency`

| `trackable_type` | `frequency` | Count | Convex `trackableType` |
|---|---|---:|---|
| `TRACKER` | `COUPLE_DAYS_A_WEEK` | 22 | `TRACKER` |
| `PERIODIC` | `COUPLE_DAYS_A_WEEK` | 9 | `DAYS_A_WEEK` (has `target_number_of_days_a_week`) |
| `PERIODIC` | `COUPLE_MINUTES_A_WEEK` | 5 | `MINUTES_A_WEEK` (has `target_number_of_minutes_a_week`) |
| `READING` | `COUPLE_DAYS_A_WEEK` | 3 | `DAYS_A_WEEK` (READING is a case-fallthrough sibling of PERIODIC in p1) |
| `COUNT` | (null) | 5 | `NUMBER` |
| `TIME_TRACK` | (null) | 3 | `TIME_TRACK` |

### `time_windows.budget_type`

| Value | Count | Convex `budgetType` |
|---|---:|---|
| `ACTUAL` | 1461 | `ACTUAL` |
| `PLANNED` | 111 | `BUDGETED` |

### Share permissions

- `list_shares.permission`: 2 × `editor` → `EDITOR`. No `viewer` rows in this dump.
- `trackable_shares.permission`: no rows.

### Recurring monthly patterns

- `recurring_tasks.monthly_pattern`: 5 NULL, no `DAY_OF_MONTH` / `NTH_WEEKDAY` rows.
- `recurring_events.monthly_pattern`: 8 NULL, same.

## `tasks.date_completed` format

Sample of distinct values: `NULL`, `2026-03-22`, `2026-04-12`, `2026-02-16`, `2026-03-29`, etc. — all ISO `YYYY-MM-DD` strings or NULL. The `DEFAULT FALSE` in the DDL never produced any literal `'FALSE'` values in practice.

## Tables to skip

- `reviews` — legacy free-text reviews; superseded by `review_questions` + `review_answers` and absent from both `app.sql` (deprecated) and the Convex schema.
- `review_answers_duplicate` — manual backup of `review_answers`, not part of any schema.

(All other 26 public tables migrate.)
