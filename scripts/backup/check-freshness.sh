#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

load_backup_environment
BACKUP_MAX_AGE_SECONDS=${BACKUP_MAX_AGE_SECONDS:-86400}

case "$BACKUP_MAX_AGE_SECONDS" in
  ''|*[!0-9]*) die 'invalid_backup_max_age' ;;
esac

[ -f "$BACKUP_STATUS_FILE" ] || die 'backup_status_missing'
success_epoch=$(last_success_epoch)
[ -n "$success_epoch" ] && [ "$success_epoch" -gt 0 ] || die 'backup_never_succeeded'

now_epoch=$(date -u +%s)
age_seconds=$((now_epoch - success_epoch))
[ "$age_seconds" -ge 0 ] || die 'backup_timestamp_in_future'
[ "$age_seconds" -le "$BACKUP_MAX_AGE_SECONDS" ] || die 'backup_stale'

printf 'backup_freshness=ok age_seconds=%s\n' "$age_seconds"
