# Ripcord

**Your AI coding agent can wipe your database, backups included, in seconds. Ripcord keeps a backup in a vault the agent is blocked from touching, restores it into a throwaway copy, and has [Kane CLI](https://www.testmuai.com/kane-cli/) log in as your user to prove the data is really there. Until that proof exists, risky agent commands are held.**

Built for the TestMu AI KaneCLI Online Hackathon with Claude Code and Kane CLI.

## Why

In April 2026 a Cursor agent running Claude deleted PocketOS's production database and its volume backups through one Railway API call, in about nine seconds ([TechSpot](https://www.techspot.com/news/112207-ai-coding-agent-running-claude-wiped-startup-database.html), [Tom's Hardware](https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-powered-ai-coding-agent-deletes-entire-company-database-in-9-seconds-backups-zapped-after-cursor-tool-powered-by-anthropics-claude-goes-rogue)). Claude Code's checkpoints only track edits made by its file tools; changes made through bash, which is how agents reach databases, are not tracked ([docs](https://code.claude.com/docs/en/checkpointing)).

And a backup that was never restored is a hope. Tools that do test restores count rows. Rows are not the app: photos, attachments, saved logins and search indexes live elsewhere.

## What it does

```
ripcord prove
  backup   -> pg_dump per database, tar per volume, sha256 manifest, stored in a vault outside the repo
  restore  -> a throwaway copy of your Compose stack on a free port
  Kane     -> logs into the live app and the copy, does the same plain English checks, reads the values back
  compare  -> PROVEN (everything matches), LOSS (exact differences), INCONCLUSIVE (a value could not be read)
  report   -> one HTML page: what Kane read on each side, Kane share links, and what a row count would say
```

- **Gate.** `ripcord hook install` adds Claude Code hooks. A destructive command (DROP, TRUNCATE, DELETE without WHERE, migrate reset, `compose down -v`, volume removal, and more) is held until a PROVEN backup exists for the latest backup. Commands that touch the vault are always blocked.
- **After a risky command.** The agent is told to run `ripcord verify`; Kane rereads the live app against the proven state. If data is gone, `ripcord rollback --yes` restores the proven backup and Kane checks it again.
- **Fix loop.** On LOSS, `ripcord fix` hands Kane's findings to Claude Code, which may only edit `ripcord.yml` (for example to add a missing volume), then proves again, up to three rounds.
- **A loss must be seen twice.** A check where live and copy disagree is read again on both sides. Conflicting readings are INCONCLUSIVE, never PROVEN.

## The study: real apps, real backup methods

Mealie, n8n and Vikunja (current releases, Postgres), each backed up three ways: the app's official method, a common guide, and a script Claude Code wrote from a plain request. Each backup was restored into a fresh copy, then checked two ways: per table row counts, and Kane logging in as the user. Full table with every Kane run: [proof page](https://ripcord-eight.vercel.app/proof.html), data in [site/data/results.json](site/data/results.json).

| App | Method | Row count says | Kane says |
|---|---|---|---|
| Mealie 3.31 | common guide: pg_dump of the database | all 70 tables match | **LOSS**: recipe photo shows on live, not in the copy (API: every photo 404) |
| Vikunja 2.8 | common guide: pg_dump of the database | all 43 tables match | **LOSS**: attachment preview works on live, fails in the copy (API: file does not exist) |
| Vikunja 2.8 | official: `vikunja dump` and `vikunja restore` | rows lost | could not log in: the restore stopped with an error and left 0 users |
| Mealie 3.31 | script written by Claude Code | match | PROVEN |
| Vikunja 2.8 | script written by Claude Code | match | PROVEN |
| Mealie 3.31 | official built in backup | match | INCONCLUSIVE (Kane did not see the photo on live either) |
| n8n 2.49 | official, and CLI export and import | match | INCONCLUSIVE (Kane's live readings disagreed; API shows the CLI copy lost the owner login and its credentials could not be decrypted) |

Two restores kept every row and still lost what users see. Only the check that used the app caught it. When Kane could not decide, Ripcord says INCONCLUSIVE instead of guessing.

## The loops, on real runs

- **Fix loop** ([replay](https://ripcord-eight.vercel.app/replay.html?run=fix)): a ripcord.yml that forgot the photo volume. Kane: photo on live, not in the copy, seen twice: LOSS. Claude Code edited only the backup settings (it added `mealie-data`). Ripcord proved again: PROVEN after 1 fix round.
- **Prove** ([replay](https://ripcord-eight.vercel.app/replay.html?run=prove)): full backup of Mealie, Kane read "photo of food", "6 servings", "3 ingredients" on live and copy: PROVEN, row counts MATCH.

## Quick start

```bash
git clone https://github.com/jenzylove/ripcord && cd ripcord
npm install && npm run build && npm link   # puts `ripcord` on your PATH (the hook calls it)
cd your-compose-project
ripcord init                    # writes ripcord.yml from docker-compose.yml
# edit the checks: what must a user still find after a restore?
export RIPCORD_EMAIL=... RIPCORD_PASSWORD=...
ripcord prove
ripcord hook install            # Claude Code now waits for a proof before destructive commands
```

Needs Docker, Node 20+, and Kane CLI logged in (`npm i -g @testmuai/kane-cli && kane-cli login`).

## What is real and what is not

| Part | Status |
|---|---|
| Backup, copy restore, row counts | real, tested on live Mealie (70 tables, 0 mismatches) |
| Kane fingerprint and compare | real Kane runs, share links in the reports |
| Claude Code gate | real hook; tested with Claude Code's hook input; 58 classifier tests |
| Fix loop | real run: LOSS, Claude Code fix, PROVEN (replay linked above) |
| Verify and rollback | real run in the Claude Code gate session (see below) |
| Managed databases (Supabase, Neon, RDS) | not supported in this version |

## Limits

- The vault is on the same machine. The hook blocks agent commands that touch it, but anything running with your user rights can still delete it. Copy it off the machine.
- Kane checks what you describe, not every record. Each check costs Kane credits (about 20 to 30 per check per side in our runs; a two check proof costs roughly 90 to 130) and one to two minutes; runs go one at a time because parallel Kane runs on one machine contaminate each other.
- No hover based checks (Kane has no hover).

## Tests

`npm test` runs 134 tests: compose parsing, config validation, value comparison, the destructive command classifier, state, Kane output parsing on real Kane runs, and the Docker engine helpers.

## License

MIT
