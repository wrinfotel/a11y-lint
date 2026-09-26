# a11y-lint

**WCAG 2.2 rules your coding agent can act on.**

A skill for Claude Code, Codex, ZCode, Cursor and any Skills-compatible agent.
Point it at a page, it finds the violations and **edits your source to fix them** —
not just a report you have to act on yourself.

```text
Read https://github.com/wrinfotel/a11y-lint/blob/main/skills/a11y-audit/SKILL.md
and audit the accessibility of https://myapp.com, then fix what you find.
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

Every rule in the fix table carries the edit — the tag to add, the attribute to
remove, the token to reach for. Around 60 rules across landmarks, images, forms,
contrast, focus, dialogs and tables.

## Install

Copy into your project:

```bash
git clone https://github.com/wrinfotel/a11y-lint.git
cp -r a11y-lint/skills/a11y-audit .claude/skills/
```

Or drop the single `SKILL.md` anywhere your agent reads skills. It has no
dependencies — it calls a public API over `curl`.

## How it works

Two paths, because the hosted API has a limit that matters.

**Deployed site** — the scan runs in a real Chromium browser against
[A11yMonitor](https://a11ymonitor.vercel.app), your own free WCAG 2.2 scanner:

```bash
curl -X POST https://a11ymonitor-api.onrender.com/api/v1/scans \
  -H 'Content-Type: application/json' -d '{"url":"https://TARGET"}'
```

The skill handles the queue, the polling, and the seven scan statuses (three of
which are failures that are easy to mistake for success).

**Anything else** — 5 scans per day per IP, and localhost is refused by design.
So the skill falls back to running axe-core directly, which has neither limit:

```bash
npx @axe-core/cli http://localhost:3000 -s a11y.json
```

Same rule IDs, same severities, same fix table. The limit is the reason the
second path exists, not a nice-to-have.


## Limits, stated up front

- **A scan is not an audit.** axe-core catches roughly a third of WCAG issues.
  Keyboard traps, focus order, meaningful sequence and alt-text *quality* still
  need a human. This skill will not tell you a page is "accessible".
- **Public URLs only.** The scanner refuses localhost and private IPs by design
  (SSRF guard). For local work, scan a deployed preview.
- **A shared free instance.** Rate limits apply and it sleeps when idle.
- **`wcagRef` is often `null`** in the response — the skill falls back to rule
  names and axe docs.

These limits are in the skill file itself, so the agent states them too instead
of overclaiming.

## Related

- [A11yMonitor](https://github.com/wrinfotel/a11ymonitor) — the scanner
  (Spring Boot + Playwright + axe-core). Free, no signup.
- [dequeuniversity.com/rules/axe](https://dequeuniversity.com/rules/axe/4.10) —
  the rule reference behind every `ruleId`.

## License

MIT
