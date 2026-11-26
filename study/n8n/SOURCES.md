# n8n study sources

Compose adapted from the official n8n-hosting repo, docker-compose/withPostgres (fetched 2026-11-25):
https://github.com/n8n-io/n8n-hosting/tree/main/docker-compose/withPostgres

Images actually run (pulled 2026-11-25):
- `docker.n8n.io/n8nio/n8n:2.49.6` (image id a1a9955a4a9e), pinned via `N8N_VERSION` in `.env`; this is the version in the official repo's `.env`
- `postgres:18` (image id c69930380214), as in the official compose

Deviations from the official compose, all declared:
- the `n8n-runner` task runner sidecar and its three `N8N_RUNNERS_*` variables are removed (not needed for data)
- host port is `${HOST_PORT:-9941}` instead of 5678
- `N8N_DIAGNOSTICS_ENABLED=false` and `N8N_VERSION_NOTIFICATIONS_ENABLED=false` added
- `.env`: `POSTGRES_NON_ROOT_USER=n8nuser` / `n8nPass123` instead of the official placeholder `changeUser`, because the official `.env` uses the same name for the superuser and the non root user, and `init-data.sh` then fails on `CREATE USER` for an existing role
- no `N8N_ENCRYPTION_KEY` is set, as in the official compose: n8n generates the key on first start and keeps it in `/home/node/.n8n/config` (the `n8n_storage` volume)

Seed: `seed.mjs` uses n8n's internal REST API (`/rest/owner/setup`, `/rest/login`, `/rest/credentials`, `/rest/workflows`), the calls the editor makes. Owner `study@example.com` / `StudyPass#2026`.
Credential `Acme Billing API key` (Header Auth), workflows `Invoice reminder` (uses the credential) and `Weekly report digest`.

Harness helpers: `verify.sh <port> <project>` (API look plus exact row counts via `rowcounts.sql`), `runmethod.sh <method> <port>` (backup, restore into `study-n8n-<method>`, verify; evidence in `evidence/<method>/`).
