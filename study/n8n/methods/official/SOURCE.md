# Official method: n8n "Back up and restore"

URL: https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/backup-and-restore (fetched 2026-11-25; page text was read through a summarising fetch tool, so the lines below are paraphrase, not verbatim, except where marked)

What the page says a complete backup of a self-hosted instance is:
- the `.n8n` folder (`/home/node/.n8n` in Docker, the `n8n_data`/`n8n_storage` volume); it holds the `config` file with the credential encryption key
- the external PostgreSQL database, backed up "with the database's own tools"
- external binary/execution storage and custom node directories, if used (not used here)

Restore (full instance): stop n8n, restore the `.n8n` folder, restore the PostgreSQL database, restore the environment configuration, start n8n.

Implemented here: `pg_dump` of the database + tar of `/home/node/.n8n`; restore loads the SQL with `psql` into a new Postgres, unpacks the folder into a new volume, starts n8n.

Other official options (not used as primary):
- CLI export, https://docs.n8n.io/hosting/cli-commands/ : `n8n export:workflow --backup`, `n8n export:credentials --backup`, restored with `n8n import:workflow|credentials --separate --input=`. The page says: "The `--backup` flag exports workflows and credentials only." and the backup page says these exports do not include users, execution history, variables or the encryption key.
- `n8n export:entities` / `import:entities` (same CLI page), exports all entity types.
