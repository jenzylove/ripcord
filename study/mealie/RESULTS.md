# Mealie results (2026-11-25)

Live: `study-mealie` on 9961, Mealie v3.31.0 + postgres:17, seeded by `seed.mjs` (3 recipes, each with ingredients and a photo).
Live API look: 3 recipes, each GET 200, image `/api/media/recipes/<id>/images/original.webp` 200 image/webp (9566, 9762, 10788 bytes).
Live row counts: `live-counts.txt` (70 tables; recipes 3, recipes_ingredients 10, users 2, ingredient_foods 10, ingredient_units 4).
No browser agent was used. Evidence under each `methods/<m>/evidence/`.

## official (built in backup via API) -> copy `study-mealie-official` port 9964
- backup.sh exit 0: `backup written: backups/mealie_v3.31.0_2026.11.25.14.56.37.zip` (zip holds database.json + data/ recipe images, 14 files).
- restore.sh exit 0: `{"message":"Restore successful","error":false}` (evidence/restore-run.txt).
- HTTP: /api/app/about 200. Immediately after the restore, login as study@example.com returned 200 but every authenticated GET (`/api/recipes?perPage=100` and each recipe) returned 401 Unauthorized, on two tries (evidence/verify-before-restart.json, verify-second-try.json).
  After `docker restart study-mealie-official-mealie-1` (the docs' own advice for post restore login trouble): 3 recipes, each GET 200 with servings 6/4/8 and ingredients 4/3/3, image 200 image/webp with identical byte sizes to live (evidence/verify-after-restart.json).
- Row counts: all 70 tables identical to live (evidence/counts-copy.txt).

## community (pg_dump database only) -> copy `study-mealie-community` port 9965
- backup.sh exit 0: `-rw-r--r-- 1 LENOVO 197121 236677 ... backups/mealie.dump`
- restore.sh exit 0 (start postgres, pg_restore, start mealie); no pg_restore errors in output.
- HTTP /api/app/about 200; login 200; 3 recipes, each GET 200 (servings 6/4/8, ingredients 4/3/3).
- Images: all three image requests returned 404 `application/json` (22 bytes) while the recipe's `image` field is still set (FuKQ, KfUD, F90r). The data volume was not part of the backup.
- Row counts: all 70 tables identical to live (evidence/counts-copy.txt).

## claude (Claude Code sonnet, unsteered prompt) -> copy `study-mealie-claude` port 9966
- Scripts written by Claude, unmodified; its text answer is in SOURCE.md. It stops Mealie during backup and dumps the database plus the data volume.
- backup.sh exit 0 (evidence/backup-run.txt).
- restore.sh exit 1, last lines of evidence/restore-run.txt: `==> Waiting for http://localhost:9966 (up to 3 minutes)` then
  `ERROR: Mealie did not answer in time. Check: docker compose -p study-mealie-claude -f .../restored/study-mealie-claude/docker-compose.yml logs mealie`.
  The machine was heavily loaded by other containers at the time. The container was healthy and answering shortly afterwards (checked a few minutes later, without changing anything).
- API look after that: /api/app/about 200; login 200; 3 recipes GET 200 (servings 6/4/8, ingredients 4/3/3); images 200 image/webp, 9566/9762/10788 bytes, same as live (evidence/verify.json).
- Row counts: all 70 tables identical to live.

## Notes
- Git Bash path rewriting caused no failures (MSYS_NO_PATHCONV=1 was exported for all runs). My own restore.sh first attempts failed on a `mktemp` path that docker.exe could not read; I changed the scripts to write the copy compose file next to the script.
