# Official method: document_exporter and document_importer

Docs: https://docs.paperless-ngx.com/administration/ (section "Making backups", "Document exporter", "Document importer";
source text: https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/administration.md)

Quotes:
- "The document exporter exports all your documents, thumbnails, metadata, and database contents to a specific folder."
- Docker example: `docker compose exec -T webserver document_exporter ../export`
- "If you've backed-up Paperless-ngx using the document exporter, restoring can simply be done with the document importer."
- Importer: `document_importer source` where source is "a directory or the generated .zip file"; "put the export inside the `export` folder ... Specify `../export` as the `source`."
- "The importer should be run against a completely empty installation (database and directories) of Paperless-ngx."
- "The exporter does not include API tokens" and "You cannot import the export generated with one version of paperless in a different version of paperless."

backup.sh uses `-z` (zip) so the export is one file that can be copied out. restore.sh starts a new project (admin bootstrap env removed so the install is empty) and runs the importer.
