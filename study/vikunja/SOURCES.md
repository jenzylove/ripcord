# Vikunja study: sources and versions

- Compose: "Example without any proxy" (Vikunja + PostgreSQL) from https://vikunja.io/docs/full-docker-example
  Changes: pinned tag, host port 9962 (container 3456), named volumes `vikunja-files` and `vikunja-db` instead of the `./files` and `./db` bind mounts
  (so copies under other project names get their own storage), and a one-shot `files-perms` service that does the `chown 1000:0` the docs ask you to do on `./files`
  (without it Vikunja logs `mkdir /app/vikunja/files/.tmp: permission denied` on a named volume).
- Images run (2026-11-25): `vikunja/vikunja:2.8.0` (sha256:35d937baf3b5d5803bed6b9e11d007448b7b536df9e4346dc35551e1072636c3; docs example uses untagged latest, which was 2.8.0), `postgres:18` (PostgreSQL 18.7, sha256:c699303802144847d238196173655dbbecf7a96aeca1565f2b02eb671a1f0b6b).
- Live project `study-vikunja` port 9962; copies `study-vikunja-official` 9967, `-community` 9968, `-claude` 9969.
- Seed: `node seed.mjs` (API only). User study / study@example.com / StudyPass123!, project "Launch Plan" with 5 tasks, task "Book venue" has attachment venue-floorplan.png (generated PNG, 2846 bytes). Output in seed-output.json.
- API check: `node verify.mjs <url>`; row counts `./counts.sh <project> vikunja vikunja db`; live results in live-api.json and live-counts.txt.
