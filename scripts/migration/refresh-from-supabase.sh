#!/usr/bin/env bash
# Refresh the local migration database from live Supabase prod and re-run
# the extractor. Idempotent: drops/recreates `timeplete_migration` every
# time so we never carry stale rows over from a previous attempt.
#
# Required env (load via direnv / .envrc, never commit):
#   SUPABASE_DB_PASSWORD   Password for the prod Supabase pooler user.
#
# Optional env:
#   SUPABASE_DB_URL_TEMPLATE  Override default pooler connection string
#                             (use `__PASSWORD__` as the placeholder).
#   BACKUP_DIR                Where dump files land. Default ~/supabase-backups.
#   SKIP_DUMP=1               Reuse an existing dump (set DUMP_FILE).
#   DUMP_FILE                 Path to an existing custom-format dump.
#   SKIP_EXTRACT=1            Stop after restore; do not re-run extract.ts.
#
# Usage:
#   ./scripts/migration/refresh-from-supabase.sh
#   SKIP_DUMP=1 DUMP_FILE=~/supabase-backups/supabase-2026-05-17.dump \
#     ./scripts/migration/refresh-from-supabase.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_CONTAINER="${PG_CONTAINER:-my-postgres}"
PG_USER="${PG_USER:-myuser}"
TARGET_DB="${TARGET_DB:-timeplete_migration}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/supabase-backups}"

URL_TEMPLATE="${SUPABASE_DB_URL_TEMPLATE:-postgresql://postgres.qvurczbirerwyrjklbgu:__PASSWORD__@aws-0-us-east-2.pooler.supabase.com:6543/postgres}"

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
blue() { printf "\033[34m%s\033[0m\n" "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { red "Missing required command: $1"; exit 1; }
}

require_cmd docker

# Ensure my-postgres is running. We avoid `docker compose` here because the
# Ubuntu `docker.io` package historically doesn't ship the Compose v2 plugin,
# and the legacy productivity-backend docker-compose.yml only describes the
# same handful of fields we can pass to `docker run` directly.
ensure_postgres_container() {
  if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    return 0
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    blue "==> Starting existing Postgres container ($PG_CONTAINER)"
    docker start "$PG_CONTAINER" >/dev/null
    return 0
  fi
  blue "==> Creating Postgres container ($PG_CONTAINER) on :5432"
  docker run -d \
    --name "$PG_CONTAINER" \
    --restart unless-stopped \
    -e POSTGRES_USER="$PG_USER" \
    -e POSTGRES_PASSWORD=mypassword \
    -e POSTGRES_DB=mydatabase \
    -p 5432:5432 \
    -v pg_data:/var/lib/postgresql/data \
    postgres:17 >/dev/null
}
ensure_postgres_container

blue "==> Waiting for Postgres to accept connections"
for _ in $(seq 1 30); do
  if docker exec -i "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1 \
  || { red "Postgres in $PG_CONTAINER did not become ready"; exit 1; }

# Step 1: dump from Supabase (unless SKIP_DUMP is set).
if [[ "${SKIP_DUMP:-0}" != "1" ]]; then
  if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
    red "SUPABASE_DB_PASSWORD is not set. Add it to .envrc (direnv) and re-run."
    exit 1
  fi
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date +%F-%H%M%S)"
  DUMP_FILE="$BACKUP_DIR/supabase-$STAMP.dump"
  blue "==> Dumping Supabase prod -> $DUMP_FILE"
  CONN="${URL_TEMPLATE/__PASSWORD__/$SUPABASE_DB_PASSWORD}"

  # Run pg_dump inside the postgres:17 container so we don't depend on a
  # local pg_dump (and we keep the version aligned with the dump format).
  docker run --rm \
    -v "$BACKUP_DIR:/backup" \
    --entrypoint pg_dump \
    postgres:17 \
    "$CONN" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="/backup/$(basename "$DUMP_FILE")"
else
  : "${DUMP_FILE:?SKIP_DUMP=1 requires DUMP_FILE to point at an existing dump}"
  test -f "$DUMP_FILE" || { red "DUMP_FILE not found: $DUMP_FILE"; exit 1; }
fi

blue "==> Restoring into $PG_CONTAINER:$TARGET_DB"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $TARGET_DB;"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d postgres \
  -c "CREATE DATABASE $TARGET_DB;"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TARGET_DB" \
  -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

docker cp "$DUMP_FILE" "$PG_CONTAINER:/tmp/dump.dump"
docker exec -i "$PG_CONTAINER" pg_restore \
  -U "$PG_USER" -d "$TARGET_DB" \
  --no-owner --no-privileges \
  --schema=public \
  /tmp/dump.dump

# Step 3: re-extract to JSONL.
if [[ "${SKIP_EXTRACT:-0}" != "1" ]]; then
  blue "==> Re-running extractor"
  cd "$ROOT"
  npx tsx scripts/migration/extract.ts
fi

blue "==> Done."
echo ""
echo "Next:"
echo "  cd $ROOT"
echo "  npx tsx scripts/migration/load.ts             # local Convex"
echo "  npx tsx scripts/migration/load.ts --prod      # prod Convex (requires CONVEX_DEPLOY_KEY)"
