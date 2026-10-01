#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TEST_TMP=$(mktemp -d)
trap 'rm -rf "$TEST_TMP"' EXIT INT TERM

pass_count=0

pass() {
  pass_count=$((pass_count + 1))
  printf 'ok %s - %s\n' "$pass_count" "$1"
}

fail() {
  printf 'not ok %s - %s\n' "$((pass_count + 1))" "$1" >&2
  exit 1
}

expect_failure() {
  name=$1
  shift
  if "$@" >"$TEST_TMP/stdout" 2>"$TEST_TMP/stderr"; then
    fail "$name"
  fi
  pass "$name"
}

expect_success() {
  name=$1
  shift
  if ! "$@" >"$TEST_TMP/stdout" 2>"$TEST_TMP/stderr"; then
    cat "$TEST_TMP/stderr" >&2
    fail "$name"
  fi
  pass "$name"
}

write_env() {
  prefix=$1
  repository=$2
  cat >"$TEST_TMP/backup.env" <<EOF
BACKUP_REPOSITORY_PREFIX=$prefix
RESTIC_REPOSITORY=$repository
RESTIC_PASSWORD=test-only-restic-password
AWS_ACCESS_KEY_ID=test-only-access-key
AWS_SECRET_ACCESS_KEY=test-only-secret-key
BACKUP_POSTGRES_CONTAINER=test-postgres
BACKUP_POSTGRES_USER=atlas
BACKUP_POSTGRES_DATABASE=atlas
BACKUP_STATUS_FILE=$TEST_TMP/status.json
BACKUP_STATE_DIR=$TEST_TMP/state
EOF
  chmod 600 "$TEST_TMP/backup.env"
}

write_fake_docker() {
  mkdir -p "$TEST_TMP/bin"
  cat >"$TEST_TMP/bin/docker" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
if [ "${FAKE_DOCKER_FAIL:-false}" = true ]; then
  exit 17
fi
if [ "${1:-}" = exec ] && [ "${3:-}" = pg_dump ]; then
  printf 'synthetic-postgresql-dump'
fi
EOF
  chmod +x "$TEST_TMP/bin/docker"
}

write_env '' 's3:https://s3.example.test/private-bucket'
expect_failure 'empty repository prefix is rejected' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh" --validate-only

write_env 'shared' 's3:https://s3.example.test/private-bucket/shared'
expect_failure 'shared root prefix is rejected' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh" --validate-only

write_env 'rebody38-production/postgresql' \
  's3:https://s3.example.test/private-bucket/another-prefix'
expect_failure 'repository and scoped prefix mismatch is rejected' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh" --validate-only

write_env 'rebody38-production/postgresql' \
  's3:https://s3.example.test/private-bucket/rebody38-production/postgresql'
expect_success 'dedicated Rebody repository prefix is accepted' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh" --validate-only

printf '\nRESTIC_IMAGE=restic/restic@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' \
  >>"$TEST_TMP/backup.env"
expect_failure 'unreviewed restic image digest is rejected' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh" --validate-only
sed -i.bak '/^RESTIC_IMAGE=/d' "$TEST_TMP/backup.env"
rm -f "$TEST_TMP/backup.env.bak"

chmod 644 "$TEST_TMP/backup.env"
expect_failure 'group-readable secret env is rejected' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh" --validate-only
chmod 600 "$TEST_TMP/backup.env"

expect_failure 'retention refuses to run without a verified target marker' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" BACKUP_PRUNE_APPROVED=true \
  "$ROOT_DIR/scripts/backup/apply-retention.sh"

expect_failure 'repository initialization requires explicit approval' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/initialize-repository.sh"

printf '{"status":"success","lastSuccessEpoch":1}\n' >"$TEST_TMP/status.json"
expect_failure 'freshness check rejects a stale backup' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" BACKUP_MAX_AGE_SECONDS=86400 \
  "$ROOT_DIR/scripts/backup/check-freshness.sh"

now_epoch=$(date -u +%s)
printf '{"status":"success","lastSuccessEpoch":%s}\n' "$now_epoch" \
  >"$TEST_TMP/status.json"
expect_success 'freshness check accepts a recent successful backup' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" BACKUP_MAX_AGE_SECONDS=86400 \
  "$ROOT_DIR/scripts/backup/check-freshness.sh"

write_fake_docker
export FAKE_DOCKER_LOG="$TEST_TMP/docker.log"
PATH="$TEST_TMP/bin:$PATH"
export PATH
if command -v sha256sum >/dev/null 2>&1; then
  repository_fingerprint=$(printf '%s' \
    's3:https://s3.example.test/private-bucket/rebody38-production/postgresql' \
    | sha256sum | awk '{print $1}')
else
  repository_fingerprint=$(printf '%s' \
    's3:https://s3.example.test/private-bucket/rebody38-production/postgresql' \
    | shasum -a 256 | awk '{print $1}')
fi
mkdir -p "$TEST_TMP/state"
printf '%s\n' "$repository_fingerprint" >"$TEST_TMP/state/verified-target.sha256"

mkdir "$TEST_TMP/state/backup.lock"
expect_failure 'overlapping backup is rejected' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" FAKE_DOCKER_LOG="$FAKE_DOCKER_LOG" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh"
rmdir "$TEST_TMP/state/backup.lock"

expect_success 'backup records success through the scoped repository' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" FAKE_DOCKER_LOG="$FAKE_DOCKER_LOG" \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh"
grep -q '"status":"success"' "$TEST_TMP/status.json" || \
  fail 'backup success status is durable'
pass 'backup success status is durable'

export FAKE_DOCKER_FAIL=true
expect_failure 'backup command failure is surfaced' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" FAKE_DOCKER_LOG="$FAKE_DOCKER_LOG" \
  FAKE_DOCKER_FAIL=true \
  "$ROOT_DIR/scripts/backup/backup-postgres.sh"
grep -q '"status":"failed"' "$TEST_TMP/status.json" || \
  fail 'backup failure status is durable'
pass 'backup failure status is durable'
unset FAKE_DOCKER_FAIL

expect_success 'retention runs only after target verification and explicit approval' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" FAKE_DOCKER_LOG="$FAKE_DOCKER_LOG" \
  BACKUP_PRUNE_APPROVED=true \
  BACKUP_PRUNE_TARGET_FINGERPRINT="$repository_fingerprint" \
  "$ROOT_DIR/scripts/backup/apply-retention.sh"
grep -q -- '--keep-daily 7 --prune' "$FAKE_DOCKER_LOG" || \
  fail 'retention is scoped to seven daily snapshots'
pass 'retention is scoped to seven daily snapshots'

expect_failure 'retention rejects an approval for another repository target' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" FAKE_DOCKER_LOG="$FAKE_DOCKER_LOG" \
  BACKUP_PRUNE_APPROVED=true BACKUP_PRUNE_TARGET_FINGERPRINT=wrong-target \
  "$ROOT_DIR/scripts/backup/apply-retention.sh"

if grep -q 'test-only-secret-key\|test-only-restic-password' \
  "$TEST_TMP/stdout" "$TEST_TMP/stderr" "$FAKE_DOCKER_LOG"; then
  fail 'secrets are absent from command output'
fi
pass 'secrets are absent from command output'

expect_failure 'restore drill requires separate explicit approval' \
  env BACKUP_ENV_FILE="$TEST_TMP/backup.env" \
  "$ROOT_DIR/scripts/backup/restore-drill.sh"

printf '1..%s\n' "$pass_count"
