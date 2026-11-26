# Security

## What Ripcord protects against

An AI coding agent running a destructive command (DROP, TRUNCATE, DELETE or UPDATE without a real WHERE, migrate reset, `db push` that accepts data loss, `docker compose down -v`, volume removal, wiping data folders) before a restorable backup exists.

## How

- `ripcord guard` runs as a Claude Code PreToolUse hook on Bash, PowerShell, Edit, Write, MultiEdit, NotebookEdit and MCP tools. A destructive command is blocked (exit 2) unless a PROVEN result exists for the latest backup.
- The guard fails closed: if its state cannot be read, destructive commands are blocked.
- Any command or file write that touches the vault, `ripcord.yml` checks state, or Ripcord's own files is blocked for the agent.
- Rollback checks each archive's sha256 against the manifest before restoring, and saves a pre rollback backup first.
- The fix loop may change only `ripcord.yml` backup settings, never the checks, and must prove its last round.

## Known limits

- The vault is on the same machine. Anything running with your user rights outside the agent can delete it. Copy backups off the machine.
- The classifier is pattern based; an agent determined to evade it through obfuscated commands may get past it. It is a seatbelt, not a sandbox.
- Kane checks what you describe in `ripcord.yml`, not every record.

## Reporting

Open a private security advisory on this repository (Security tab, "Report a vulnerability").
