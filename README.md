# a11y-lint

**WCAG 2.2 rules your coding agent can act on.**

A skill for Claude Code, Codex, ZCode, Cursor and any Skills-compatible agent.
Point it at a page, it finds the violations and **edits your source to fix them**
— not just a report you have to act on yourself.

```text
Read https://github.com/wrinfotel/a11y-lint/blob/main/skills/a11y-audit/SKILL.md
and audit the accessibility of http://localhost:3000, then fix what you find.
```

## The problem with accessibility scanners

axe-core is excellent. It is also the part everyone already has. When it finds a
contrast failure it tells you:

```text
color-contrast: Element has insufficient color contrast of 2.1 (foreground #94a3b8,
background #0f172a, required 4.5)
```

That is correct and useless. It does not know that your design system already has
a token for exactly this. An agent reading that line has to search your theme
file, guess, and possibly invent a hex.

`a11y-lint` ships the **fix**, not the finding:

```text
color-contrast — #94a3b8 on #0f172a is 2.1:1, needs 4.5:1
Fix: use your --text-muted token on this surface, or drop to --text-secondary.
Do not hardcode a hex; the pair is defined in app/globals.css.
```

Around 60 rules across landmarks, images, forms, contrast, focus, dialogs and
tables, each with the concrete edit.

## Install

```bash
git clone https://github.com/wrinfotel/a11y-lint.git
cp -r a11y-lint/skills/a11y-audit .claude/skills/
cd .claude/skills/a11y-audit && npm install axe-core
```

One dependency, one file. Then:

```bash
node scan.mjs http://localhost:3000
```

## How it works

`scan.mjs` spawns a headless browser, injects axe-core, and runs the audit
locally. **No server, no API, no network, no driver.**

That last point is the design decision. A hosted scanner is a liability: it
sleeps when idle, has a request quota, refuses `localhost`, cannot reach your
private network, and adds a round trip to every check. This runs in ~3 seconds
against `http://localhost:3000` and gives the same rule IDs and severities.

It finds a browser itself — a Playwright cache or a system Chrome — and uses
Node's built-in WebSocket to talk to it, so there is nothing to configure.

```bash
node scan.mjs <url>                  # report
node scan.mjs <url> --json           # JSON
node scan.mjs <url> --wait 4000      # slow SPAs
```

Exit codes: `0` scanned, `1` error, `2` bad arguments. A non-zero code means no
audit happened — the skill says so instead of reporting a clean page.

## Limits, stated up front

- **A scan is not an audit.** axe-core catches roughly a third of WCAG issues.
  Keyboard traps, focus order, meaningful sequence and alt-text *quality* still
  need a human.
- **Client-rendered content may be missed** at the default 1.2s wait. Raise
  `--wait` for slow SPAs.
- **Single page.** It audits the URL you give; it does not crawl.
- **Nothing behind a login.**

These are in the skill file itself, so the agent states them too instead of
overclaiming.

## Credits

Built on [axe-core](https://github.com/dequelabs/axe-core) by Deque, and the
rule reference at
[dequeuniversity.com/rules/axe](https://dequeuniversity.com/rules/axe/4.13).

Related: [A11yMonitor](https://github.com/wrinfotel/a11ymonitor) — a hosted
WCAG 2.2 scanner for humans, same engine.

## License

MIT
