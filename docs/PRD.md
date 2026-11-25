# Ripcord: product requirements

Locked Nov 25 2026. Deadline Thu Nov 26 2026, 18:29 UTC (11:59 PM IST). This file is the single source of truth: anything not written here is not claimed.

## One liner

Your AI coding agent can wipe your database, backups included, in seconds. Ripcord keeps a backup the agent cannot reach, restores it into a throwaway copy, and has Kane log in as your user to prove the data is really there. Until that proof exists, risky agent commands are held.

## Problem (sourced)

- April 2026, PocketOS: a Cursor agent on Claude Opus 4.6 deleted the production database and its volume backups through one Railway API call in about nine seconds; the newest off-site backup was three months old (TechSpot, TechRadar, Tom's Hardware). Railway later recovered it and added 48 hour delayed deletes.
- Claude Code deleted DataTalks.Club's production database; Replit's agent deleted SaaStr's (July 2025).
- Claude Code checkpoints only track edits made by its file tools; changes made through bash, which is how agents reach databases, are not tracked (Claude Code docs, "Checkpointing").
- Existing restore testers (Databasus, pgproof, AWS Backup restore testing) restore and count rows. Rows are not the app: photos, attachments, saved logins (encryption keys), search indexes live elsewhere. Real users report exactly these losses after restores: Immich thumbnails (Immich GitHub and forum), n8n "credentials could not be decrypted" (n8n forum), Karakeep empty search until reindex (Karakeep troubleshooting docs).
- Our spike (Nov 25): Mealie v3.31.0 + Postgres. A database-only restore kept every row; Kane read "missing or broken image placeholder" for the recipe photo. A full restore: Kane read "6 servings, 3 ingredients, plain orange image", matching live. Claude Code's own backup scripts for Mealie and n8n were correct in content but both failed unmodified on Windows Git Bash (path rewritten inside the container).

## User and front door

First user: a solo builder or small team whose app holds real users' data in a Docker Compose stack (Postgres or SQLite plus upload folders) and who lets Claude Code work on it.

Front door (terminal, because it needs the database):
1. `npx ripcord-cli init` in the project: reads docker-compose.yml, lists databases and volumes, writes `ripcord.yml` (app URL, login variable names, fingerprint checks, vault path).
2. `ripcord prove`: backs up, restores a throwaway copy on a free port, Kane logs into the live app and the copy, compares what the user sees, prints PROVEN or LOSS with the exact differences and screenshots, writes a report page.
3. `ripcord hook install`: adds the Claude Code hooks.

## Full scope

1. **Backup engine:** per database service a native dump (pg_dump custom format; SQLite file copy from its volume), per named volume a tar streamed through `docker run alpine`, manifest with sha256 per file. Always sets `MSYS_NO_PATHCONV=1`. Stored in a vault outside the repo (default `~/.ripcord-vault/<project>/<timestamp>`).
2. **Restore into a copy:** rewrites the compose file to a new project name, fresh volumes, remapped host ports; loads the dump and volume tars; starts the stack; waits until the app URL answers.
3. **Fingerprint:** plain English checks in `ripcord.yml`, each with the values Kane must read back (for example "open recipe Jollof Rice and say whether its photo shows a real picture or a broken placeholder"). Kane runs every check on the live app and on the copy, one run at a time (parallel runs contaminate each other, Kane issue #242).
4. **Compare:** normalised value comparison, live against copy; verdict PROVEN (all match), LOSS (list of differences), INCONCLUSIVE (a Kane run failed or did not read a value). Never PROVEN unless every check returned its values on both sides.
5. **Row count baseline:** the same comparison a row counter would make (per table counts, live against copy), shown next to Kane's verdict, so the report shows when rows say fine and the user would not.
6. **Fix loop:** on LOSS, `ripcord fix` hands the report (differences, Kane summaries, screenshot paths, current ripcord.yml) to Claude Code headless; it may only edit `ripcord.yml` (add a volume, a file path, a secret file to the backup) ; Ripcord reruns prove; up to 3 rounds; every round logged.
7. **Gate (Claude Code PreToolUse hook):** classifies Bash commands and database MCP calls as destructive (DROP, TRUNCATE, DELETE without WHERE, migrate reset, db push with data loss flags, compose down -v, volume rm, rm on data or vault paths, platform delete commands). Destructive and no PROVEN proof newer than the last backup-relevant change: block (exit 2) with the reason and the command to run (`ripcord prove`). Proven: allow and record. Commands touching the vault path are always blocked.
8. **After a risky command (PostToolUse hook):** tells the agent to run `ripcord verify`, where Kane rereads the fingerprint on the live app; if data is missing, `ripcord rollback` restores the proven backup into the live stack and Kane proves the fingerprint matches again.
9. **Report:** per prove, a JSON file and a static HTML page: verdict, each check with live and copy values side by side, Kane's screenshots, share links, row count baseline.
10. **Study (external evidence):** real open source apps at current versions, each backed up three ways (the app's official method, the most common community method, a Claude Code script from an unsteered prompt), restored into a copy, checked by Kane and by row counts. Apps: Mealie, n8n, Karakeep, Linkwarden, Vikunja, Paperless-ngx; Immich and Actual if time allows. Every result published, including methods that lose nothing.
11. **Site:** landing page, `/proof` (study table with screenshots and Kane share links), `/demo` (recorded run). Kane also checks the site itself before each deploy (dogfood).

## How each judging criterion is met

- Ships: one command runs backup, restore, Kane proof and report on a real Compose app; the gate and rollback run inside real Claude Code.
- Verified: Kane proves restores at the user's level and catches losses row counts miss, on real open source apps with real backup methods.
- Closed loop: Kane's verdict decides what the agent may do (blocked until proven), drives the fix rounds on the backup config, and confirms rollback.
- Craft: `npx ripcord-cli init` on any Compose project; plain English checks; one report page.

## Claims and how each is proven

| Claim | Proof |
|---|---|
| A restore can keep every row and still lose what users see | Study table: row count verdict next to Kane verdict, with screenshots |
| Ripcord's own backup restores everything on the study apps | prove reports per app, Kane share links |
| The agent cannot run a destructive command without a fresh proof | recorded Claude Code session plus hook unit tests |
| Rollback restores what the user sees | rollback report with Kane share links |
| Common backup methods lose data on real apps | study rows per method, misses included |

## What it does not do

- Managed databases (Supabase, Neon, RDS) are out of scope for restore proofs in this version: their auth, storage and secrets do not come along in a dump. Stated in the README.
- The vault is on the same machine; the hook blocks agent commands that touch it, but a person or a determined process with the same user rights can still delete it. Off-machine copies are listed as a limit.
- Kane checks what a user sees on the chosen checks, not every record.
- No hover-dependent checks (Kane has no hover).

## Sponsor checklist (becomes docs/SUBMISSION_CHECKLIST.md)

- [ ] Public GitHub repo, created on or after Nov 12 2026
- [ ] Built with an AI coding agent (Claude Code)
- [ ] Kane CLI used; testmuai.com account with the same email
- [ ] Bar 1: works end to end
- [ ] Bar 2: Kane caught or proved something
- [ ] Bar 3: the agent and Kane CLI talked to each other
- [ ] About text: what was built, which agent, what Kane does
- [ ] YouTube demo, 3 to 5 minutes
- [ ] Live URL (optional)
- [ ] At least two public posts (X, HN, Reddit or LinkedIn)
- [ ] Judges can run it: instructions plus a recorded fallback
- [ ] Submitted at kaneclihack.sh/o/submit before 18:29 UTC Nov 26
