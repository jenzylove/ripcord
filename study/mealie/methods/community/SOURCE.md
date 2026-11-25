# Community method: pg_dump of the database

Mealie's own docs stress its built-in backup; the common third party advice for a Postgres deployment is the generic
"dump the database with pg_dump" recipe run through `docker compose exec`. A search for Mealie specific
pg_dump guides returned only generic PostgreSQL in Docker guides, so this script follows those:

- https://dev.to/dmdboi/automated-postgresql-backups-in-docker-complete-guide-with-pgdump-52a
  (`docker exec -t <container> pg_dump -U <user> -Fc -d <db> > backup.dump`, custom format restored with pg_restore)
- https://levelup.gitconnected.com/how-to-backup-and-restore-your-dockerized-postgres-database-a76a11ccf53e
- https://wiki.miem.hse.ru/Projects/239/docs/odoo/backup (`docker-compose exec postgres pg_dump -U ... > file`)

The scripts back up only the database (not the /app/data volume), which is what these guides do.
The restore adaptation (new project and port) is the only change: start postgres, pg_restore, then start mealie.
