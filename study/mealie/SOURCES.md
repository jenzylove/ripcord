# Mealie study: sources and versions

- Compose: Mealie with Postgres, from the official docs https://mealie.io/documentation/getting-started/installation/postgres/
  (changes: host port 9961, removed hard coded `container_name` lines so copies can run under other project names,
  postgres pg_isready health check uses `-U mealie`).
- Images actually run (pulled 2026-11-25):
  - `ghcr.io/mealie-recipes/mealie:v3.31.0` (image id sha256:97e21ac96e9a8d1ee15aaf558ba3f14998936b9d6f334e40ebb4c6c2127dc12f)
  - `postgres:17` (PostgreSQL 17.12, image id sha256:87c8b42f423b45d5247e6aa8fdb2e7762fec164c68a50fe3eb07e7bfcaf4dbcf)
- Live project `study-mealie` (port 9961); copies `study-mealie-official` 9964, `-community` 9965, `-claude` 9966.
- Seed: `node seed.mjs` through the real API. User study@example.com / StudyPass123!, 3 recipes with structured ingredients and a generated PNG photo each.
- API check: `node verify.mjs <url>`; row counts: `./counts.sh <project> mealie mealie`.
