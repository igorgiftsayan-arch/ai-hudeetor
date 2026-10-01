#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

load_backup_environment
[ "${BACKUP_TARGET_VERIFICATION_APPROVED:-false}" = true ] || \
  die 'target_verification_not_approved'

ensure_private_directory "$BACKUP_STATE_DIR"
restic_run snapshots \
  --host "$BACKUP_SCOPE_HOST" \
  --tag "$BACKUP_SCOPE_TAG" \
  --json >/dev/null

temporary_marker="$BACKUP_TARGET_MARKER.tmp.$$"
repository_fingerprint >"$temporary_marker"
chmod 600 "$temporary_marker"
mv "$temporary_marker" "$BACKUP_TARGET_MARKER"
printf 'backup_target=verified\n'
