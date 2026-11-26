# Community method: pg_dump plus a copy of the media folder

Guides found by search for Docker + PostgreSQL Paperless-ngx backups:
- https://deployn.de/en/blog/paperless-backup-restore/ (uses `docker compose exec -T db pg_dump -U <user> -d <db> > paperless-db.sql` as the database half; its main method also uses document_exporter)
- https://forums.truenas.com/t/paperless-ngx-backup-and-restore-process/29546 (people use the exporter; the thread describes no database dump)
- https://dev.to/piteradyson/postgresql-docker-backup-strategies-how-to-backup-postgresql-running-in-docker-containers-1bla (generic `docker exec ... pg_dump` and psql restore)

Honest note: the exporter is also what most community posts use, so it is the official method here. The guides that avoid the exporter
describe the "physical" backup the official docs list for Docker (volumes `media`, `data`, database): dump the database with pg_dump and
copy the documents (media) folder. This script does exactly that and does not copy the `data` volume (search index, classifier, secret key files).
The restore adaptation (new project and port) loads the SQL into an empty db, starts paperless and copies media back in.
