# Community method: n8n CLI export of workflows and credentials

Most common approach in third party guides and forum answers: run the n8n CLI inside the container and export workflows and credentials as JSON, restore with the import commands into a fresh n8n.

Sources (fetched 2026-11-25):
1. https://instapods.com/blog/backup-n8n-workflows-credentials/ : `n8n export:workflow --backup --output=...`, `n8n export:credentials --backup --output=...`; restore `n8n import:workflow --separate --input=...`, `n8n import:credentials --separate --input=...`. The article also says to save the encryption key from `~/.n8n/config` separately because encrypted credential exports cannot be restored without it.
2. https://community.n8n.io/t/restore-backups-of-workflows/9205 : forum answers use `docker exec ... n8n export:workflow --backup --output=...`.
3. https://hostadvice.com/blog/web-hosting/vps/backup-and-restore-strategies-for-n8n-on-vps/ : could not be fetched (HTTP 403), listed only as a search result; not relied on.

Implemented exactly as the guides: no encryption key handling, no user/database backup. Restore targets a new project: fresh stack, then the two import commands.
