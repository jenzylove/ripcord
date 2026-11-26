I wrote both scripts next to this session's working directory and didn't run them or syntax-check them. Both are in `study/paperless/methods/claude/`:

- `backup.sh`
- `restore.sh`

**`backup.sh`**
- It makes `backups/paperless-<UTC timestamp>/` in the same folder as the script. That means the folder `methods/claude/`, not wherever you run it from. Use `BACKUP_ROOT=./backups` if you want it relative to your current directory.
- Each backup holds:
  - a Postgres dump
  - a tarball of the `data` volume
  - a tarball of the `media` volume (your documents)
  - a copy of the compose file, which pins the image versions
  - `SHA256SUMS`
- It briefly stops the webserver while it copies, so the database and document files match. It starts the webserver again when it finishes, even if the backup fails.
- It builds into a `.partial` folder and only renames it when everything succeeded. A failed run leaves no half-backup behind.
- It skips the `export` and `consume` volumes. `export` is only output. `consume` is your inbox of files not yet imported, so anything sitting there isn't backed up.

**`restore.sh <backup> <project-name> <port>`**
- It checks the arguments first. It refuses the name `study-paperless`, the live port 9963, a port that is already published, and a project name that already exists.
- It checks the checksums, then writes a modified compose file to `<backup>/restored-<project>/`. That file has the new port in both the port mapping and `PAPERLESS_URL`. It uses the compose copy stored in the backup, so the images match the data.
- It creates the new project's own empty volumes and unpacks `data` and `media` into them. It then starts only the database, restores the dump, and only then starts the webserver. It waits until `http://localhost:<port>` answers.
- It never touches the original stack. It prints the exact command to delete the copy (`down -v`) when you're done.

- **Credentials in backups:** the backup includes the compose file, which contains your secret key and admin password. The script restricts permissions, but keep the backups private. The restored copy uses the same login as the original.
- **Windows:** both scripts need Git Bash or WSL with Docker running.
