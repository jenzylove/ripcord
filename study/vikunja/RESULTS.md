# Vikunja results (2026-11-25)

Live: `study-vikunja` port 9962, Vikunja 2.8.0 + postgres:18, seeded via API (1 user, project "Launch Plan", 5 tasks, task "Book venue" with attachment venue-floorplan.png).
Live API look (live-api.json): task 2 GET 200; attachment download 200 image/png, 2846 bytes, sha256 prefix a6b8ac3be31c3524; preview 200 (15663 bytes).
Live row counts: live-counts.txt (projects 2, tasks 5, task_attachments 1, files 1, users 1, buckets 9, project_views 12).
No browser agent used. Evidence in each `methods/<m>/evidence/`. The `sessions` table differs between live and copies only because each API check logs in (creates a session).
Note: verify.mjs prints `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` on Windows when it exits after the last fetch; harmless node exit noise.

## official (`vikunja dump` / `vikunja restore`) -> copy `study-vikunja-official` port 9967
- backup.sh exit 0: `backup written: backups/vikunja-dump-20261125T191652Z.zip` (46 files: database/*.json, files/1, ...).
- restore.sh without piped answers (attempts 1 and 2, evidence/restore-run-attempt1-no-stdin.txt, attempt2): `level=ERROR msg="could not read confirmation message: EOF"` and `could not read from stdin: EOF`; script still printed "restored into ..." and exited 0.
- restore.sh with piped answers, three runs, all exit 0 from the script but the `vikunja restore` command logged an ERROR and stopped part way each time:
  - run A (evidence/restore-run.txt): `level=ERROR msg="expected string for JSON field 'frontend_settings', got <nil>"` after `Restored table files`
  - run B (evidence/restore-rerun2.txt) and run C (restore-rerun3.txt): `level=ERROR msg="could not restore table data for table tasks: ERROR: invalid input syntax for type double precision: \"MA==\" (SQLSTATE 22P02)"`
  - an earlier try (attempt 2 with the confirm lines, console only) also logged `Could not reset id sequence for task_unread_statuses_id_seq`.
- State of the copy after run A (evidence/verify.json, counts-copy.txt): HTTP /api/v1/info 200; login as study returned 403 `{"code":1011,"message":"Wrong username or password."}`. Row counts: users 0, projects 0, tasks 0, task_attachments 0, buckets 0, project_views 0; `files` 1 and `migration` 163 only. The database had been wiped ("Wiped database.") and not refilled.
- Same dump, restored by hand is not attempted here (no method changes).

## community (plain SQL pg_dump of the database) -> copy `study-vikunja-community` port 9968
- backup.sh exit 0: `backups/vikunja.sql` 91211 bytes. restore.sh exit 0, no errors in output.
- HTTP 200; login 200; projects Inbox / Launch Plan / My Open Tasks; 5 task titles present; task "Book venue" shows attachment venue-floorplan.png (2846).
- Attachment download: 404 `{"code":4034,"message":"The file does not exist."}`, preview 404 same message (files volume not backed up).
- Row counts identical to live (including `files` 1, `task_attachments` 1) except `sessions`.

## claude (Claude Code sonnet) -> copy `study-vikunja-claude` port 9969
- Scripts unmodified; answer in SOURCE.md. backup.sh exit 0 (db dump + files volume tar + compose copy + manifest in one tar.gz). restore.sh exit 0, no errors; reported "done. The copy is running at http://localhost:9969".
- HTTP 200; login 200; 5 tasks; attachment download 200 image/png, 2846 bytes, sha256 prefix a6b8ac3be31c3524 (same as live); preview 200, 15663 bytes.
- Row counts identical to live except `sessions`.

## Notes
- Git Bash: `docker cp <container>:/tmp/x ./x` needs a relative host path; absolute `/tmp/...` host paths do not exist for docker.exe. All runs used MSYS_NO_PATHCONV=1.
- The `files-perms` helper and named volumes are my compose adaptation (see SOURCES.md).
