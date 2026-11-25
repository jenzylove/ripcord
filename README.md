# Ripcord

**Your AI coding agent can wipe your database, backups included, in seconds. Ripcord keeps a backup the agent cannot reach, restores it into a throwaway copy, and has [Kane CLI](https://www.testmuai.com/kane-cli/) log in as your user to prove the data is really there. Until that proof exists, risky agent commands are held.**

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

## Real runs (Mealie v3.31.0 with Postgres, Docker Compose)

| Run | Kane read on the copy | Row count | Verdict |
|---|---|---|---|
| Database only restore (spike) | recipe photo: "missing or broken image placeholder" | every row present | LOSS a row count misses |
| `ripcord prove`, full backup | "photo of food", "6 servings", "3 ingredients", same as live | MATCH | PROVEN |

Report files and Kane share links: [demo/mealie/.ripcord/reports](demo/mealie/.ripcord/reports).

## Quick start

```bash
npm i -g ripcord-cli            # or clone and: npm install && npm run build && npm link
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
| Fix loop, verify, rollback | implemented; demo runs recorded in docs/BUILD_LOG.md as they land |
| Managed databases (Supabase, Neon, RDS) | not supported in this version |

## Limits

- The vault is on the same machine. The hook blocks agent commands that touch it, but anything running with your user rights can still delete it. Copy it off the machine.
- Kane checks what you describe, not every record. Each check costs Kane credits (about 20 to 25 per check per side in our runs) and one to two minutes; runs go one at a time because parallel Kane runs on one machine contaminate each other.
- No hover based checks (Kane has no hover).

## Tests

`npm test` runs 126 tests: compose parsing, config validation, value comparison, the destructive command classifier, state, Kane output parsing on real Kane runs, and the Docker engine helpers.

## License

MIT
