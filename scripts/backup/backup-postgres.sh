#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

load_backup_environment

if [ "${1:-}" = '--validate-only' ]; then
  printf 'backup_configuration=valid\n'
  exit 0
fi

require_verified_target
require_command docker
ensure_private_directory "$BACKUP_STATE_DIR"

lock_directory="$BACKUP_STATE_DIR/backup.lock"
if ! mkdir "$lock_directory" 2>/dev/null; then
  die 'backup_already_running'
fi

previous_success=$(last_success_epoch)
staging_directory=''
completed=false

cleanup() {
  exit_code=$?
  if [ -n "$staging_directory" ]; then
    rm -rf "$staging_directory"
  fi
  rmdir "$lock_directory" >/dev/null 2>&1 || true
  if [ "$completed" != true ]; then
    write_status failed "$previous_success" backup_failed
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

staging_directory=$(mktemp -d "$BACKUP_STATE_DIR/staging.XXXXXX")
dump_file="$staging_directory/postgresql.dump"

docker exec "$BACKUP_POSTGRES_CONTAINER" \
  pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --username "$BACKUP_POSTGRES_USER" \
  --dbname "$BACKUP_POSTGRES_DATABASE" \
  >"$dump_file"

[ -s "$dump_file" ] || die 'empty_postgresql_dump'
chmod 600 "$dump_file"

restic_run_with_mount "$staging_directory" /backup:ro \
  backup /backup/postgresql.dump \
  --host "$BACKUP_SCOPE_HOST" \
  --tag "$BACKUP_SCOPE_TAG" \
  --quiet

success_epoch=$(date -u +%s)
write_status success "$success_epoch" backup_completed
completed=true
printf 'backup_status=success\n'
