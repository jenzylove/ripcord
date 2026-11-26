I wrote both scripts in `study/karakeep/methods/claude/`. I haven't run or syntax-checked either one, and I haven't made them executable. Run them with `bash backup.sh`, or `chmod +x` them first.

**`backup.sh`** takes no arguments.
- It saves the `data` volume (the SQLite database and your saved assets), the `meilisearch` volume, your `.env` and `docker-compose.yml`.
- It briefly stops `web` and `meilisearch` so the database is copied in a consistent state. It restarts them afterwards, including on error or Ctrl-C.
- It writes `./backups/karakeep-study-karakeep-<UTC timestamp>.tar.gz`, with a SHA256 file inside and permissions set to 600.
- The archive contains your `.env` secrets, so keep it private.

**`restore.sh <backup> <project-name> <port>`**
- It checks the archive's checksums first.
- It refuses to run if the project name is `study-karakeep`, or if that project's volumes or containers already exist. It also refuses if the port is already published by a running container, so it can't touch your live stack.
- It puts the backup's compose file and `.env` in `./restored/<project>/`, with only `HOST_PORT` changed. It creates the new stack, loads the volumes, starts it, and waits for the web page to answer on the port.
- If something fails partway, it removes the half-built copy. On success it prints the command to delete the copy later.

Check these before the first real run:
- **Helper image:** both scripts use `alpine:3` to read and write the volumes, so your machine needs to be able to pull it. You can override it with `HELPER_IMAGE=...`.
- **Brief downtime:** your Karakeep is unavailable for a few seconds during each backup.
- **Meilisearch:** its index is rebuildable. If you'd rather not stop it, you can drop it from the backup.

Try a restore soon after your first backup, for example `./restore.sh backups/<file> karakeep-check 9943`. A backup you haven't restored is still untested.
