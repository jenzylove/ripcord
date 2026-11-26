I wrote both scripts in `study/vikunja/methods/claude/` and ran neither. I haven't syntax-checked them either, so expect to fix a few things on the first real run.

**`backup.sh`**
- It needs the `db` container of `study-vikunja` to be running. Otherwise it stops with a clear error.
- It writes one file, `backups/vikunja-<UTC timestamp>.tar.gz`. The backups folder sits next to the script.
- The archive holds:
  - a `pg_dump` of the database
  - a tar of the `vikunja-files` volume (your attachments)
  - a copy of your compose file, so a restore uses the same image tags
  - a `MANIFEST` with the date, the Vikunja image and row counts for users, projects, tasks and labels
- It doesn't stop the stack. The database dump is a consistent snapshot, but a file uploaded in the second or so between the two steps could end up in the archive without a matching database row. That's harmless.
- It checks that the dump and the tar are readable before it keeps anything. The archive is written to a `.partial` file and renamed only once it checks out.

**`restore.sh <backup> <project-name> <port>`**
- It refuses to run if the project name is `study-vikunja` or already has containers or volumes. It also refuses port 9962 and any port a running container is already using, so it can't touch the live stack.
- It writes `restored/<project>/docker-compose.yml` from the backed-up compose file, with the host port and `VIKUNJA_SERVICE_PUBLICURL` changed to your port. Postgres and the attachment volume are fresh and belong to the new project.
- It then loads the dump and unpacks the attachments. It starts Vikunja and waits for `http://localhost:<port>/api/v1/info` to answer.
- It prints the new row counts so you can compare them with the manifest, plus the command that removes the copy.

Both scripts set `MSYS_NO_PATHCONV` so Git Bash on Windows doesn't rewrite the `/app/...` paths. The restore edits ports with `sed` and fails loudly if your compose file's port line or public-URL line doesn't look like the current one.

Backups hold your data and the compose file with its secrets, and they sit on the same disk as the stack. Copy them somewhere else as well.
