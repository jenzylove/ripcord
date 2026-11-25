# Spike: Kane proves a restore at the user's level (Nov 25 2026)

Question: can Kane log into a restored copy of a real app and catch a loss that row counts miss?

Setup: Mealie v3.31.0 with Postgres 17 (Docker Compose, project rclive, port 9925), two recipes with photos created through Mealie's API. Claude Code (Sonnet) wrote backup.sh and restore.sh from one plain request and did not run them.

Runs:
1. The AI backup failed unmodified on Windows Git Bash: `tar: can't change directory to 'C:/Program Files/Git/app/data'` (Git Bash rewrote the container path). Fixed with MSYS_NO_PATHCONV=1. The n8n script Claude wrote later failed the same way.
2. Full restore into project rctest on port 9926. Kane read: servings "6 servings", ingredients "3", photo "plain orange image". Matches live. 24.0 credits. Fixture: test/fixtures/kane-mealie-full-restore.ndjson
3. Control: database-only backup (same db.dump, empty data volume) restored on port 9927. Every row present. Kane read photo "missing or broken image placeholder". 20.7 credits. Fixture: test/fixtures/kane-mealie-dbonly-restore.ndjson

Verdict: proven. Kane distinguishes a full restore from a database-only one at the user's level; a row count cannot.
Also learned: two Kane runs at once on one machine contaminate each other (Kane issue #242); one run reading many values can run out of turns.
