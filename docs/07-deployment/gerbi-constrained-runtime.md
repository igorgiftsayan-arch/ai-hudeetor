# Constrained Gerbi runtime — 2026-09-25

## Observed checkpoint

The single active test stack is `atlas-gerbi-expanded`, HTTP port3114. The five
previous Daily Coach services were stopped gracefully; all old volumes remain.
No main branch or public production deployment was changed. New PostgreSQL,
Redis and MinIO volumes are independent of the old stack. Migrations completed.
Seven running services were healthy, with zero restarts and OOMKilled=false.
This is infrastructure acceptance; browser/full paid food flow is still pending.
HTTP is not physical-device HTTPS Web Push acceptance; PUSH_ENABLED=false.

Actual private-storage probe through the same public gateway: anonymous PUT403,
signed PUT200, anonymous GET403; authenticated GET matched the exact synthetic
PNG bytes. Only that synthetic probe object was removed. MinIO init exited0 and
requires private bucket policy. No AI provider request was made by this probe.

Memory caps in MiB: API256, worker256, web192, PostgreSQL128, Redis64, MinIO256,
gateway32. Initial RSS approximately490MiB total; after storage gate available
host RAM1049MiB/1967MiB. Disk3939MiB free. These snapshots are not peak-load proof.

## Artifact provenance

- Application source `da9e837`; web component `26e6e0a` includes consent fix531996f.
- Local Node24.18.0 / pnpm11.14.0; backend/API/worker production compilation PASS.
- Web BuildID `1JMefJ6sk_9sCsOKqO_eh`; NEXT_PUBLIC_API_BASE_URL=/api/v1.
- Web tar SHA256 `b3cbf7b60872fc496fdca0f39fbe424ddcd4fca52f51aac900853560f17b9673`.
- Runtime archive SHA256 `088c16bbbe582309bec2fac8c7495c0c3dbf303f5280b2f37451a04fc36b4ab8`.
- Existing dependency image f381d484eadbe3f57e0dee60f5daa07b3fb46447f9ab6ea1a610064be6194d02.
  Linux amd64 Node24.18.0; lock SHA256c4fff4ce645c0e80a33578b83e23d4afd5f674b77b0ca43d639d70371169e372
  and backend/web manifests match. Native sharp and argon2 passed offline checks.
  Old image code is replaced by read-only current dist/.next mounts; no Darwin
  node_modules are transferred. The image itself is not claimed to be current code.

## MinIO source build fallback

Official public registry anonymous tokens had no pull action and returned401 for
both pinned tag/digest; official historical binary URLs returned410. No private
authentication bypass or third-party mirror was used. Owner authorized local
builds of the same upstream releases, with no server compilation.

- Official Go1.24.2 Darwin arm64 archive SHA256
  b70f8b3c5b4ccb0ad4ffa5ee91cd38075df20fdbd953a1daedd47f50fbcff47a.
- MinIO RELEASE.2025-04-22T22-12-26Z tag object f19c534b9f457773dcd043d977433e1a71525c3b,
  peeled commit0d7408fc9969caf07de6a8c3a84f9fbb10a6739e.
- MC RELEASE.2025-04-16T18-13-26Z tag object1e78af443bf0443eb177f26421fe081f08d83dc5,
  peeled commitb00526b153a31b36767991a4f5ce2cced435ee8e.
- Build both: Go1.24.2, CGO_ENABLED=0 GOOS=linux GOARCH=amd64,
  GOMAXPROCS=2, `go build -p 2 -tags kqueue -trimpath` with upstream
  buildscripts/gen-ldflags.go. Both `go mod verify` PASS. DEVELOPMENT label retained.
- MinIO binary SHA25651e11e3dbb73f4805e4cc0a6edcc7bca9007478debd4ab87657510f7a3130af4;
  go.sum SHA25627b57eced706cc0cd34cb4a971560ba601002590b91d4fe24c67f0ced9732f7a.
- MC binary SHA25646048312078528931c501001530d252df146f4de1ea43ed2a8ce54c4593b4515;
  go.sum SHA256db374a95c19c57832366a8af3918e786dfed8222dda491f28c79bfda752df68b.
- Existing Node24.18 slim carrier image6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d.
  Both binary version commands passed in96MiB offline Linux containers. These are
  locally built upstream binaries, not official published image digests.

## Reproduce and rollback

Use compose.yaml, infrastructure/compose.gerbi-expanded.yaml, then optional
infrastructure/compose.gerbi-artifacts.yaml with GERBI_RUNTIME_RELEASE_DIR pointing
to a verified release tree containing current dist/.next/database and bin/minio,bin/mc.
Use project atlas-gerbi-expanded; `--no-build --pull never`. Root-only env files
are Compose interpolation inputs; only allowlisted per-service variables are injected.
Never include work/ or secret files in an artifact archive. Validate config quietly.

Before cutover: require at least2GiB free disk, back up old DB, preserve volumes,
record exact previous service names. Backup current Daily Coach dump:57858bytes,
SHA2566ef54fdd132b0600ff98a7009e4f1142045b7302e4c433a3b9c63b2490e5f927,
pg_restore list verified138lines; root-only server backups directory.
Stop only atlas-daily-coach-{gateway,web,api,redis,postgres}-1. Start new storage,
require minio-init success, run migrations, then app services and readiness probes.
On failure stop expanded and restart only those five old services; delete no volumes.
Actual cutover logs and rollback script are root-only under
/opt/projects/ai-hudeetor-gerbi-expanded-runtime/. No rollback was needed.
