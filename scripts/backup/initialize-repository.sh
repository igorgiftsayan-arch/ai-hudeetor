#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

load_backup_environment
[ "${BACKUP_REPOSITORY_INIT_APPROVED:-false}" = true ] || \
  die 'repository_initialization_not_approved'

restic_run init
printf 'backup_repository=initialized\n'
