#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

load_backup_environment
require_verified_target

restic_run forget \
  --host "$BACKUP_SCOPE_HOST" \
  --tag "$BACKUP_SCOPE_TAG" \
  --keep-daily 7 \
  --dry-run

printf 'backup_retention_preview=complete\n'
