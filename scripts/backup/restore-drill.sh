#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

load_backup_environment
[ "${BACKUP_RESTORE_APPROVED:-false}" = true ] || die 'restore_not_approved'
require_verified_target
require_command docker

ensure_private_directory "$BACKUP_STATE_DIR"
run_id="$(date -u +%Y%m%d%H%M%S)-$$"
staging_directory=$(mktemp -d "$BACKUP_STATE_DIR/restore.XXXXXX")
network="rebody-backup-restore-$run_id"
volume="rebody-backup-restore-$run_id"
container="rebody-backup-restore-$run_id"
require_command openssl
restore_password=$(openssl rand -hex 32)

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$staging_directory"
}
trap cleanup EXIT INT TERM

restic_run_with_mount "$staging_directory" /restore \
  restore latest \
  --host "$BACKUP_SCOPE_HOST" \
  --tag "$BACKUP_SCOPE_TAG" \
  --target /restore

dump_file="$staging_directory/backup/postgresql.dump"
[ -s "$dump_file" ] || die 'restored_dump_missing'

docker network create "$network" >/dev/null
docker volume create "$volume" >/dev/null
docker run -d \
  --name "$container" \
  --network "$network" \
  --volume "$volume:/var/lib/postgresql/data" \
  --env POSTGRES_USER=restore_user \
  --env POSTGRES_PASSWORD="$restore_password" \
  --env POSTGRES_DB=restore_database \
  postgres:17-alpine >/dev/null

ready=false
attempt=0
while [ "$attempt" -lt 60 ]; do
  if docker exec "$container" pg_isready -U restore_user -d restore_database >/dev/null 2>&1; then
    ready=true
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$ready" = true ] || die 'restore_postgresql_not_ready'

docker cp "$dump_file" "$container:/tmp/postgresql.dump"
docker exec "$container" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --username restore_user \
  --dbname restore_database \
  /tmp/postgresql.dump

table_count=$(docker exec "$container" psql \
  --username restore_user \
  --dbname restore_database \
  --tuples-only \
  --no-align \
  --command "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema');")
[ "$table_count" -gt 0 ] || die 'restore_has_no_application_tables'

migration_count=$(docker exec "$container" psql \
  --username restore_user \
  --dbname restore_database \
  --tuples-only \
  --no-align \
  --command 'select count(*) from drizzle.__drizzle_migrations;')
[ "$migration_count" -gt 0 ] || die 'restore_has_no_migration_metadata'

printf 'restore_drill=success tables=%s migrations=%s\n' "$table_count" "$migration_count"
