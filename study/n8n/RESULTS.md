# n8n results (no browser agent), run 2026-11-25

Stack: n8n 2.49.6 + postgres:18, live project `study-n8n` on 9941, seeded with `node seed.mjs`
(owner study@example.com, credential "Acme Billing API key", workflows "Invoice reminder" and "Weekly report digest").
Live API baseline: `evidence/live-verify.txt`. Live non zero rows: credentials_entity=1, workflow_entity=2, shared_credentials=1, shared_workflow=2, user=1, project=1, workflow_history=2, settings=5, deployment_key=8, migrations=369 (all 140+ public tables counted exactly in the evidence files).
All copies run in new compose projects `study-n8n-<method>`; torn down with `down -v` afterwards.

| Method | Scripts | Copy answers HTTP | Owner login in copy | Workflows via API | Credential via API | Row counts live vs copy |
|---|---|---|---|---|---|---|
| official (pg_dump + .n8n folder) | backup exit 0, restore exit 0 | yes, /healthz 200 on 9944 | HTTP 200 | 2: Invoice reminder, Weekly report digest | opens, HTTP 200, value redacted by n8n as `__n8n_BLANK_VALUE_...` (same as live) | identical, every table |
| community (CLI export/import) | backup exit 0, restore exit 0 | yes, /healthz 200 on 9945 | HTTP 401 `{"code":401,"message":"Wrong username or password. Do you have caps lock on?"}`; `/rest/settings` has `showSetupOnFirstLoad: true` (no owner account in the copy) | after creating an owner on the copy through `/rest/owner/setup`: 2 workflows present | after owner setup: credential listed, but `data` is `{}` instead of the header name and redacted value; n8n log: `Credentials could not be decrypted. The likely reason is that a different "encryptionKey" was used to encrypt the data.` / `error:1C800064:Provider routines::bad decrypt` | identical to live (the row exists, its ciphertext cannot be read with the copy's new key) |
| claude (sonnet, headless) | backup exit 0; restore exit 1 | no copy was created | n/a | n/a | n/a | n/a |

## official
Evidence: `evidence/official/` (backup.log, restore.log, verify.txt, rowcount-diff.txt).
- backup: `n8n-db.sql` 630946 bytes, `n8n-folder.tar.gz` 1534 bytes (contains `.n8n/config`).
- First restore attempt crash looped n8n: `Deployment key 'signing.hmac' cannot be read with this instance encryption key`. Cause was a bug in my adaptation of restore.sh (I extracted the archive one directory too high so the key file was not at `/home/node/.n8n/config`); fixed in `methods/official/restore.sh`, copy torn down and the whole method rerun. Results above are from the rerun.

## community
Evidence: `evidence/community/` (verify.txt shows the 401 login; after-owner-setup.txt shows the API after I created an owner on the copy; rowcount-diff*.txt empty = no differences).
- restore log: `Successfully imported 2 workflows.` and `Successfully imported 1 credential.`
- the copy has no user account and a different encryption key: the owner login is gone, and the credential cannot be decrypted.

## claude
Prompt run from `methods/claude` exactly as specified; output in `methods/claude/SOURCE.md`; scripts untouched.
- backup.sh without any help failed on Git Bash: `couldn't find env file: C:\c\Users\LENOVO\ripcord\study\n8n\.env` then `ERROR: postgres container of project 'study-n8n' is not running...` then `BACKUP FAILED - nothing kept.` (`evidence/claude/backup-without-shim.log`). Cause: script passes the POSIX style `/c/...` path from `pwd` to docker.exe, not a content bug.
- Rerun with `MSYS_NO_PATHCONV=1` and a PATH shim named `docker` (kept outside the study dirs) that converts `/c/...` arguments to `C:/...`: backup exit 0, produced db.dump (692K, pg_dump -Fc), n8n_storage.tgz, env.backup, MANIFEST.txt (`evidence/claude/backup.log`).
- restore.sh then failed, exit 1, verbatim:
  `==> Verifying checksums`
  `sha256sum: 'standard input': no properly formatted SHA256 checksum lines found`
  The manifest written by Git Bash's sha256sum uses the binary marker (`<hash> *db.dump`), restore.sh greps for `<hash>  ` (two spaces). No containers or volumes were created. Not fixed per rules; the restore of this method was therefore never exercised, so nothing is known about its data completeness.
