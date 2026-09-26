# a11y-lint

**WCAG 2.2 rules your coding agent can act on.**

A skill for Claude Code, Codex, ZCode, Cursor and any Skills-compatible agent.
Point it at a page, it finds the violations and **edits your source** to fix them.

<p align="center">
  <img src="demo.gif" alt="a11y-lint: scan finds 4 WCAG violations, the agent fixes them, re-scan shows 0" width="820">
</p>

## Why this and not axe-core

axe-core is the engine and it is excellent. The gap is everything after it:
turning `color-contrast failed` into "raise `--text-muted` to meet 4.5:1, or drop
to `--text-secondary`". This skill ships that mapping — 33 rules, each with
the concrete edit, not the rule name.

| | axe-core CLI | this |
|---|---|---|
| Finds violations | yes | yes (same engine) |
| Tells the agent *what to change* | no | yes, per rule |
| Works on `localhost` / private IPs | with setup | yes, no setup |
| Server, quota, network | needs a driver | none |

## Install

```bash
git clone https://github.com/wrinfotel/a11y-lint.git
cd a11y-lint/skills/a11y-audit && npm install axe-core
```

Then point your agent at `skills/a11y-audit/`.

## Use

```bash
node scan.mjs <url>              # human-readable report
node scan.mjs <url> --json       # machine-readable
```

The demo above is the whole loop, on a local fixture: **4 violations → fix →
0 violations**, with `rules passed` climbing 13 → 19 as the markup got more
semantic.

## Install into an agent

```bash
cp -r a11y-lint/skills/a11y-audit .claude/skills/
cd .claude/skills/a11y-audit && npm install axe-core
```

## Limits

A scan is not an audit. axe-core catches roughly a third of WCAG issues —
keyboard traps, focus order, and alt-text *quality* still need a human.
Single page, no crawling, and a scan that exits non-zero means the audit did
not happen — read the skill for how to report that honestly.

## License

MIT
