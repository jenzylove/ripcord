I wrote both scripts in `C:\Users\LENOVO\ripcord\study\mealie\methods\claude\`. I haven't run them or syntax-checked them.

**`backup.sh`** (no arguments) writes `backups/mealie-backup-<timestamp>.tar.gz` next to the script. It contains:
- **`db.dump`:** a `pg_dump` of the Postgres database.
- **`mealie-data.tar`:** the whole `study-mealie_mealie-data` volume.
- **`MANIFEST.txt`:** the image versions and the time of the backup.

Mealie is stopped for a few seconds while it runs, so the database and the files are captured at the same moment. It starts again afterwards, even if the backup fails. It checks that the dump and the tar are readable before it saves the final file, and it writes under a temporary name first so a failed run never leaves a half-written backup.

**`restore.sh <backup> <project-name> <port>`** restores into a separate copy of the stack and never touches `study-mealie`.
- **Compose copy:** it writes a copy of your `docker-compose.yml` to `restored/<project-name>/`, with the port and `BASE_URL` changed to your port.
- **Restore order:** it starts a fresh Postgres, loads the database, unpacks the data volume, then starts Mealie. It waits for `http://localhost:<port>` to answer.
- **Refusals:** it won't run if the project name is `study-mealie`, if that project name already has containers or volumes, or if the port is already in use by another container.
- **Version warning:** it warns if the backup's Mealie version differs from the one in your compose file now.
- **Cleanup:** it prints the `down -v` command to delete the copy when you're done.

Things to know:
- Run them with `bash backup.sh` and `bash restore.sh ...` from Git Bash. They need Docker Compose v2. They set `MSYS_NO_PATHCONV` so Git Bash doesn't mangle container paths.
- `restore.sh` finds the port by pattern-matching `"<port>:9000"` in your compose file. If you change that line's format, it stops with an error instead of guessing.
- Backups stay on the same disk until you copy them elsewhere.

Try a restore with a throwaway name, for example `bash restore.sh backups/<file> study-mealie-check 9962`. A backup you haven't restored isn't proven.
