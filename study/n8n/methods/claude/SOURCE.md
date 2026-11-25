I wrote both scripts in `methods/claude/` and haven't run either one. I also haven't syntax-checked them, so run `bash -n` on them first.

**`backup.sh`** (no arguments, needs the `study-n8n` stack running)
- It writes `./backups/<timestamp>/` next to the script. If it fails partway, it deletes the half-written folder.
- The folder holds:
  - `db.dump`: a `pg_dump -Fc` of the Postgres database. It's taken while the stack is up, so there's no downtime.
  - `n8n_storage.tgz`: the `/home/node/.n8n` volume. n8n generates its encryption key there, since your `.env` doesn't set `N8N_ENCRYPTION_KEY`. Without that key, restored credentials can't be decrypted.
  - `env.backup`: a copy of your `.env`.
  - `MANIFEST.txt`: n8n and Postgres images and sha256 sums.
- It checks that the tar and dump files can be read before it keeps the folder.
- The folder is mode 700 because it contains secrets.

**`restore.sh <backup> <project-name> <port>`**
- It refuses to run if any of these is true:
  - The project name is `study-n8n`.
  - The port is your live port or already in use.
  - The project name already has containers or volumes.
  - The backup's checksums don't match.
- It then does this in order:
  - Creates the new project with its own volumes.
  - Starts a fresh Postgres, which runs `init-data.sh`.
  - Restores the dump in a single transaction, so any error rolls it back.
  - Unpacks the storage volume.
  - Starts n8n and waits for `/healthz`.
  - Prints table, workflow and credential counts to compare with the live stack.
- The port is passed as `HOST_PORT` in the shell environment, so your `.env` is never edited.

**Things to know**
- **Active workflows run in the copy.** Schedules and triggers fire for real. Set `RESTORE_START_N8N=0` to restore the data and leave n8n stopped.
- **Postgres restore is the least certain step.** I didn't use `--clean`, since the new database is empty. If `pg_restore` complains about the `public` schema, that's the spot to look.
- **Keep the backups out of git and copy them elsewhere.** `backups/` isn't gitignored yet, and a backup on the same disk doesn't help if the disk dies.
- **Teardown:** `docker compose -p <name> down -v` removes a test copy. The script prints the full command.
