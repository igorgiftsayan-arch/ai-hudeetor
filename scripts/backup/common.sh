#!/bin/sh

RESTIC_IMAGE_DEFAULT='restic/restic@sha256:08916bcda4a4435f9d9828ebb4e91bb7ada3d2c8a53699788930e0ae1bd4fa67'
BACKUP_SCOPE_TAG_DEFAULT='rebody38-production-postgresql'
BACKUP_SCOPE_HOST_DEFAULT='atlas-rebody38-production'

die() {
  printf 'backup_error=%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing_command_$1"
}

require_value() {
  key=$1
  eval "value=\${$key:-}"
  [ -n "$value" ] || die "missing_$key"
}

load_backup_environment() {
  BACKUP_ENV_FILE=${BACKUP_ENV_FILE:-/root/rebody38-backup/backup.env}
  [ -f "$BACKUP_ENV_FILE" ] || die 'missing_backup_env_file'

  if stat -c '%a' "$BACKUP_ENV_FILE" >/dev/null 2>&1; then
    env_mode=$(stat -c '%a' "$BACKUP_ENV_FILE")
    env_owner=$(stat -c '%u' "$BACKUP_ENV_FILE")
  else
    env_mode=$(stat -f '%Lp' "$BACKUP_ENV_FILE")
    env_owner=$(stat -f '%u' "$BACKUP_ENV_FILE")
  fi
  case "$env_mode" in
    400|600) ;;
    *) die 'backup_env_permissions_must_be_400_or_600' ;;
  esac
  if [ "$(id -u)" -eq 0 ] && [ "$env_owner" -ne 0 ]; then
    die 'backup_env_must_be_owned_by_root'
  fi

  # shellcheck disable=SC1090
  . "$BACKUP_ENV_FILE"

  require_value BACKUP_REPOSITORY_PREFIX
  require_value RESTIC_REPOSITORY
  require_value RESTIC_PASSWORD
  require_value AWS_ACCESS_KEY_ID
  require_value AWS_SECRET_ACCESS_KEY
  require_value BACKUP_POSTGRES_CONTAINER
  require_value BACKUP_POSTGRES_USER
  require_value BACKUP_POSTGRES_DATABASE
  require_value BACKUP_STATUS_FILE
  require_value BACKUP_STATE_DIR

  RESTIC_IMAGE=${RESTIC_IMAGE:-$RESTIC_IMAGE_DEFAULT}
  BACKUP_SCOPE_TAG=${BACKUP_SCOPE_TAG:-$BACKUP_SCOPE_TAG_DEFAULT}
  BACKUP_SCOPE_HOST=${BACKUP_SCOPE_HOST:-$BACKUP_SCOPE_HOST_DEFAULT}
  BACKUP_TARGET_MARKER=${BACKUP_TARGET_MARKER:-$BACKUP_STATE_DIR/verified-target.sha256}

  case "$BACKUP_REPOSITORY_PREFIX" in
    rebody38-production/*) ;;
    *) die 'repository_prefix_not_rebody_scoped' ;;
  esac

  case "$BACKUP_REPOSITORY_PREFIX" in
    */postgresql) ;;
    *) die 'repository_prefix_not_postgresql_scoped' ;;
  esac

  case "$RESTIC_REPOSITORY" in
    s3:*) ;;
    *) die 'repository_must_use_s3' ;;
  esac

  repository_without_slash=${RESTIC_REPOSITORY%/}
  case "$repository_without_slash" in
    */"$BACKUP_REPOSITORY_PREFIX") ;;
    *) die 'repository_prefix_mismatch' ;;
  esac

  [ "$RESTIC_IMAGE" = "$RESTIC_IMAGE_DEFAULT" ] || \
    die 'restic_image_digest_not_approved'
}

repository_fingerprint() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$RESTIC_REPOSITORY" | sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$RESTIC_REPOSITORY" | shasum -a 256 | awk '{print $1}'
  else
    die 'missing_sha256_command'
  fi
}

ensure_private_directory() {
  directory=$1
  mkdir -p "$directory"
  chmod 700 "$directory"
}

restic_run() {
  require_command docker
  docker run --rm \
    --env-file "$BACKUP_ENV_FILE" \
    "$RESTIC_IMAGE" "$@"
}

restic_run_with_mount() {
  mount_source=$1
  mount_target=$2
  shift 2
  require_command docker
  docker run --rm \
    --env-file "$BACKUP_ENV_FILE" \
    --volume "$mount_source:$mount_target" \
    "$RESTIC_IMAGE" "$@"
}

write_status() {
  status=$1
  success_epoch=$2
  category=$3
  attempt_epoch=$(date -u +%s)
  attempt_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  status_directory=$(dirname "$BACKUP_STATUS_FILE")
  ensure_private_directory "$status_directory"
  temporary_status="$BACKUP_STATUS_FILE.tmp.$$"
  printf '{"status":"%s","lastAttemptAt":"%s","lastAttemptEpoch":%s,"lastSuccessEpoch":%s,"category":"%s"}\n' \
    "$status" "$attempt_at" "$attempt_epoch" "$success_epoch" "$category" \
    >"$temporary_status"
  chmod 600 "$temporary_status"
  mv "$temporary_status" "$BACKUP_STATUS_FILE"
}

last_success_epoch() {
  [ -f "$BACKUP_STATUS_FILE" ] || {
    printf '0\n'
    return
  }
  stored_epoch=$(sed -n 's/.*"lastSuccessEpoch":\([0-9][0-9]*\).*/\1/p' "$BACKUP_STATUS_FILE" | head -n 1)
  case "$stored_epoch" in
    ''|*[!0-9]*) printf '0\n' ;;
    *) printf '%s\n' "$stored_epoch" ;;
  esac
}

require_verified_target() {
  [ -f "$BACKUP_TARGET_MARKER" ] || die 'target_not_verified'
  expected=$(repository_fingerprint)
  actual=$(sed -n '1p' "$BACKUP_TARGET_MARKER")
  [ "$actual" = "$expected" ] || die 'verified_target_fingerprint_mismatch'
}
