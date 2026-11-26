# Official method: `vikunja dump` and `vikunja restore`

Docs: https://vikunja.io/docs/cli
- dump: "Creates a zip file with all Vikunja-related files" (config, version, uploaded files, full database). Flags `-p/--path`, `-f/--filename`.
- restore: `vikunja restore [path to dump zip file]` restores config, files and database from the dump; `--preserve-config` keeps the current config.
- "When Vikunja runs in Docker, run both commands inside the Vikunja container with `docker exec`."

backup.sh: `docker exec <vikunja> /app/vikunja/vikunja dump -p /tmp -f <name>` then `docker cp` the zip out.
restore.sh: new compose project with an empty Vikunja, `docker cp` the zip in, `vikunja restore /tmp/restore.zip`.
Adaptation beyond new project/port: `restore` asks two interactive questions (type `Yes, I understand`, then press enter after checking env config), so the script pipes `Yes, I understand` and an empty line to `docker exec -i`. (My first two attempts without that input are kept in evidence/.)
