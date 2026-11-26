# Community method: pg_dump of the Postgres database, piped back with psql

Vikunja's own "what to backup" page (https://vikunja.io/docs/what-to-backup) describes the database dump as
`pg_dump -U <user> -h <host> <database> > vikunja-backup.sql` and the restore as piping the file back into `psql`.
The Docker flavour that guides repeat is to run the same commands through `docker exec` / `docker compose exec`:

- https://dev.to/piteradyson/postgresql-docker-backup-strategies-how-to-backup-postgresql-running-in-docker-containers-1bla
  (`docker exec -t <container> pg_dump -U <user> -d <db> > backup.sql`, restore with `docker exec -i ... psql < backup.sql`)
- https://simplebackups.com/blog/docker-postgres-backup-restore-guide-with-examples
- https://levelup.gitconnected.com/how-to-backup-and-restore-your-dockerized-postgres-database-a76a11ccf53e

No forum thread was found by search; the method is the generic one. It backs up the database only, not the files volume.
The restore adaptation (new project, new port) starts only the db service, loads the SQL, then starts vikunja.
