---
name: a11y-audit
description: Check web pages for WCAG 2.2 AA accessibility violations and FIX them in the codebase. Use when the user asks to check accessibility, audit a11y/WCAG, find accessibility issues, verify a page is accessible, or when writing/reviewing components that need accessible markup (aria roles, labels, contrast, focus order, alt text).
---

# a11y-audit

Scan a live page for WCAG 2.2 AA violations, then fix them in the source.

The value is not the finding — **axe-core already finds these.** The value is the
fix: every violation below carries the concrete edit, not the rule name.

## Scan

**The public API allows 5 scans per day per IP, resetting at 00:00 UTC.** This is
the hard limit that shapes everything below. If you get HTTP 429 with
`retryAfterSeconds`, you are not being throttled temporarily — you are out for
the day. Do not retry in a loop; switch to the local path.

Two options, in order of preference:

### Option A — scan the deployed site (default)

```bash
# 1. Start a scan (returns id, status QUEUED)
curl -s -X POST https://a11ymonitor-api.onrender.com/api/v1/scans \
  -H 'Content-Type: application/json' -d '{"url":"https://TARGET"}'

# 2. Poll until status is terminal (cold start ~30s, full scan 30-120s)
curl -s https://a11ymonitor-api.onrender.com/api/v1/scans/SCAN_ID
```

Poll every 5s, up to 180s. A scan of a cold instance takes **~55s**; a warm one
is faster. Do not report failure before 180s.

### Option B — run axe-core yourself (when the public limit is spent, or for local work)

The public API refuses `localhost` by design, so local projects need this path.
The rule IDs and severities are **identical** to the API — the fix table below
applies unchanged. Only the response shape differs.

```bash
npx @axe-core/cli http://localhost:3000            # human-readable
npx @axe-core/cli http://localhost:3000 -s a11y.json  # save JSON
```

Real flags, verified: `-s [file]` saves JSON, `-j` pipes to stdout, `-q` exits
non-zero on violations. **There is no `--json` flag** — it errors with
`unknown option '--json'`.

Requires Chrome plus a matching `chromedriver`. If you get a WebDriver error on
a server or container, `--chrome-path` and `--chromedriver-path` usually fix it.


### Statuses — there are seven, and three are failures

| status | meaning | what to do |
|---|---|---|
| `QUEUED` / `RUNNING` | still working | keep polling |
| `DONE` | success | report the score |
| `PARTIAL` | some pages loaded | report with a caveat — the score covers less than the whole site |
| `FAILED_SITE_DOWN` | the target would not load | the site blocked the headless browser or is down. Retry once; if it fails again, say the site refused the scan. **Not** a bug in your markup. |
| `FAILED_TIMEOUT` | scan exceeded its limit | the page is too heavy. Scan a lighter page, or fewer pages. |
| `FAILED_ROBOTS` | blocked by robots.txt | ask the user for permission or use a different URL. |

**These are not `FAILED`.** Polling on `DONE`/`FAILED` alone will hang forever on
`FAILED_SITE_DOWN` — match on anything terminal, not on a literal `FAILED`.

## What the response gives you

```json
{
  "status": "DONE", "score": 92, "issuesTotal": 2, "pagesScanned": 1,
  "issues": [{
    "ruleId": "landmark-one-main",
    "ruleHelp": "Document should have one main landmark",
    "helpUrl": "https://dequeuniversity.com/rules/axe/4.10/landmark-one-main",
    "wcagRef": null,
    "severity": "MODERATE",
    "instanceCount": 1,
    "sampleUrls": ["https://example.com"]
  }]
}
```

`score` is 0–100. `severity` is one of `CRITICAL` / `SERIOUS` / `MODERATE` / `MINOR`.

## The fix table

This is the part that matters. Match `ruleId` and apply the edit.

### Landmarks and structure

| ruleId | The fix |
|---|---|
| `landmark-one-main` | Wrap the primary content in `<main>`. Exactly one per page. |
| `region` | Every element must sit inside a landmark (`header`/`nav`/`main`/`footer`/`aside`). Add a landmark to the offending wrapper. |
| `page-has-heading-one` | Add a single `<h1>` — usually the page title. |
| `heading-order` | Never skip a level: `h1 → h2 → h3`. If you jumped, retag the heading. |
| `bypass` | Add a skip link as the first focusable element: `<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>`, and give the target `id="main"`. |
| `landmark-unique` | Two landmarks with the same role need distinct `aria-label` values. |

### Images and media

| ruleId | The fix |
|---|---|
| `image-alt` | `alt=""` if decorative. If it carries meaning, describe its **function**, not its appearance: `alt="Search results for `spring`"` — not `alt="search icon"`. |
| `image-redundant-alt` | The alt repeats adjacent text. Use `alt=""` and let the visible text carry it. |
| `input-image-alt` | `<input type="image">` needs `alt="…"`. |
| `area-alt` | `<area>` inside `<map>` needs `alt="…"`. |
| `object-alt` | Provide `<object>` fallback text. |
| `video-caption` | `<track kind="captions" src="…" srclang="en">`. Captions are mandatory, not optional. |

### Forms and labels

| ruleId | The fix |
|---|---|
| `label` | Every form control needs a real `<label for="id">`. Placeholder text is **not** a label — it disappears on input and often fails contrast. |
| `form-field-multiple-labels` | Multiple labels for one control: keep one `<label>`, move the rest into `aria-describedby`. |
| `select-name`, `button-name`, `link-name` | Control has no accessible name. Add visible text, or `aria-label` when an icon is all that fits. |
| `autocomplete-valid` | Add `autocomplete="email"` / `"name"` / `"tel"` etc. Password managers and users need this. |
| `label-title-only` | Placeholder used as the only label. Add a real `<label>`. |

### Color and contrast

| ruleId | The fix |
|---|---|
| `color-contrast` | Ratio must be ≥4.5:1 for normal text, ≥3:1 for large (≥18.66px bold or ≥24px). Prefer raising the text color over lightening the background — check your design tokens for an existing pair before hardcoding a hex. |
| `color-contrast-enhanced` | AAA needs 7:1. |
| `link-in-text-block` | Links inside paragraphs need a non-colour cue: underline. |
| `color-only` | Never encode meaning in color alone — add an icon, text, or pattern. |

### Focus and keyboard

| ruleId | The fix |
|---|---|
| `focus-visible` | Style `:focus-visible` with a clear outline. Never `outline: none` without a replacement. |
| `focus-order-semantics` | `tabindex` positive values break natural order. Use `0` or `-1` only. |
| `scrollable-region-focusable` | Scrollable `div`s need `tabindex="0"` and an accessible name. |
| `nested-interactive` | A `role="button"` containing another `role="button"` breaks keyboard use. Flatten it. |
| `aria-hidden-focus` | `aria-hidden="true"` on focusable content hides what keyboard users still reach. Remove focusability or the attribute. |

### Dialogs and dynamic content

| ruleId | The fix |
|---|---|
| `aria-dialog-name` | `<div role="dialog" aria-modal="true">` needs `aria-labelledby` or `aria-label`. |
| `aria-allowed-attr` | The attribute is not valid for that role — check the ARIA spec for the role. |
| `aria-valid-attr-value` | The attribute value is not a real ARIA value (e.g. `aria-live="politee"`). |
| `aria-roles` | The role name is misspelled or does not exist. |
| `aria-command-name` | A `role="button"`/link must have an accessible name. |

### Tables

| ruleId | The fix |
|---|---|
| `th-has-data-cells` | Empty `<th>` breaks the header association. Add content or `scope`. |
| `table-duplicate-name` | Two tables with the same caption — disambiguate. |
| `td-headers-attr` | Use `headers="id1 id2"` to associate cells with their headers. |

## Reporting

Lead with the number that matters: score, then `CRITICAL`/`SERIOUS` count.
Group fixes by file, since that is how the user will act on them.

```
A11y audit — https://example.com
Score 92/100 · 2 issues (0 critical, 0 serious, 2 moderate)

frontend/app/page.tsx
  1. landmark-one-main — no <main> element (1 instance)
     Fix: wrap the page content in <main id="main">
  2. region — content outside any landmark (1 instance)
     Fix: the footer <div> is outside a landmark — make it <footer>
```

Then apply the fixes yourself. Do not stop at the report if the user asked for a
fix, and do not claim a fix works until you re-scan and the score moved.

## Limits — know these before you promise anything

- **The scan is not the audit.** axe-core catches roughly a third of WCAG
  issues. Keyboard traps, focus order, meaningful sequence, and alt-text
  *quality* need a human. Never tell the user a page is "accessible" — say
  what was checked.
- **Only public URLs.** The API refuses private IPs and localhost (SSRF guard,
  HTTP 400 `invalid_url`). `localhost:3000` cannot be scanned. For local work,
  scan a deployed preview instead.
- **JavaScript must render first.** The scanner loads the page in Chromium and
  waits; content that appears only after a long interaction may be missed.
- **`wcagRef` is often `null`.** Fall back to the rule name and `helpUrl`.
- **Free tier, shared instance.** The public API is rate-limited and sleeps when
  idle. One person's scan can be slowed by another's.

## When there is no public URL

If the user is working locally and has no deployed preview, do not fake a scan.
Instead, read the markup directly and apply the same fix table statically —
say plainly that you reviewed the source rather than a live scan.
