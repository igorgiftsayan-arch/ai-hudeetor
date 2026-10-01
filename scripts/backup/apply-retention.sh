#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

load_backup_environment
[ "${BACKUP_PRUNE_APPROVED:-false}" = true ] || die 'prune_not_approved'
require_verified_target
require_value BACKUP_PRUNE_TARGET_FINGERPRINT
current_fingerprint=$(repository_fingerprint)
[ "$BACKUP_PRUNE_TARGET_FINGERPRINT" = "$current_fingerprint" ] || \
  die 'prune_target_fingerprint_mismatch'

restic_run forget \
  --host "$BACKUP_SCOPE_HOST" \
  --tag "$BACKUP_SCOPE_TAG" \
  --keep-daily 7 \
  --prune

printf 'backup_retention=applied\n'
