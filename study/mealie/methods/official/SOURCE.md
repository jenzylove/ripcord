# Official method: Mealie built in backup (Admin > Backups)

Docs: https://mealie.io/documentation/getting-started/usage/backups-and-restoring/

What the page says (short quotes, rest paraphrased): backups are managed at Settings > Admin Settings > Backups
(`/admin/backups`), where you can create, upload, download, delete and restore a backup. Restoring is destructive: it
deletes all data in the database and cannot be undone, and afterwards you are logged out and must log back in. The page
adds that "if you can't log in after a restore" with an "Invalid credentials" error, restart the Mealie container.
For Postgres, restoring needs a superuser database account.
Backups are also exposed through the API (`POST /api/admin/backups`, `POST /api/admin/backups/upload`, `POST /api/admin/backups/{name}/restore`), which the scripts use because they are the same actions as the buttons.
