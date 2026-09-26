---
name: a11y-audit
description: Check web pages for WCAG 2.2 AA accessibility violations and FIX them in the codebase. Use when the user asks to check accessibility, audit a11y/WCAG, find accessibility issues, verify a page is accessible, or when writing/reviewing components that need accessible markup (aria roles, labels, contrast, focus order, alt text).
---

# a11y-audit

Scan a real page for WCAG 2.2 AA violations, then fix them in the source.

The value is not the finding — **axe-core already finds these.** The value is the
fix: every rule below carries the concrete edit, not the rule name.

## Setup (once per project)

```bash
npm install axe-core
```

That is the only dependency. The scanner is one file, `scan.mjs`, sitting next
to this skill.

## Scan

```bash
node scan.mjs <url>              # human-readable report
node scan.mjs <url> --json       # machine-readable
```

Useful flags:

| flag | default | what it does |
|---|---|---|
| `--json` | off | JSON to stdout, for parsing |
| `--wait <ms>` | 1200 | extra settle time before auditing — raise for slow SPAs |
| `--timeout <ms>` | 90000 | hard limit; the scanner exits non-zero if hit |
| `--browser <path>` | auto | override browser detection |

The scanner finds a browser automatically: a Playwright cache
(`~/.cache/ms-playwright`), or a system Chrome/Chromium. It needs no driver, no
server, and no network. It works on `localhost`, on private IPs, and offline.

**Exit codes:** `0` scanned, `1` error (no browser, empty page, timeout),
`2` bad arguments. A non-zero code means no audit happened — say so rather than
reporting findings.

## Reading the output

```
http://127.0.0.1:8899/bad.html
7 violations — 2 critical, 3 serious, 2 moderate, 0 minor
axe-core 4.13.0 · 26 rules passed

[CRITICAL] button-name — Buttons must have discernible text
  https://dequeuniversity.com/rules/axe/4.13/button-name?application=axeAPI
  1 instance
  target: button
  html:   <button></button>
  why:    Element does not have inner text that is visible to screen readers
```

`target` is the CSS selector — use it to find the element in the source.
`html` is the offending snippet. `why` is axe-core's message.

In JSON mode each violation has `id`, `impact` (`critical` / `serious` /
`moderate` / `minor`), `help`, `helpUrl`, and `nodes[]` with `target`, `html`,
and the message.

## The fix table

This is the part that matters. Match the rule `id` and apply the edit.

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

Lead with the number that matters: counts by severity, then fixes grouped by
file, since that is how the user will act on them.

```
A11y audit — http://localhost:3000
7 violations: 2 critical, 3 serious, 2 moderate

src/components/Modal.tsx
  1. aria-dialog-name — dialog has no accessible name (1 instance)
     target: div[role="dialog"]
     Fix: add aria-labelledby pointing at the modal title
  2. button-name — empty icon button (1 instance)
     target: button.close
     Fix: add aria-label="Close"

src/app/page.tsx
  3. image-alt — <img src="x.png"> has no alt (1 instance)
     Fix: descriptive alt, or alt="" if decorative
```

Then apply the fixes yourself. Do not stop at the report if the user asked for a
fix, and **do not claim a fix works until you re-scan and the violation count
actually dropped.** Re-run `scan.mjs` and compare.

## Limits — know these before you promise anything

- **A scan is not an audit.** axe-core catches roughly a third of WCAG issues.
  Keyboard traps, focus order, meaningful sequence, and alt-text *quality* need
  a human. Never tell the user a page is "accessible" — say what was checked.
- **Client-rendered content may be missed.** The default wait is 1.2s. For a
  slow SPA raise it: `--wait 4000`. Content behind a click or a login is not
  scanned at all.
- **Single page only.** It audits the URL you give. It does not crawl.
- **Affects only what axe can measure** — roughly 30–40% of WCAG AA.
- **Broken sites return an error, not findings.** If the scanner exits non-zero
  or prints `error:`, the audit did not happen. Report that, not a clean bill
  of health.

## When the page is behind a login

Do not fake it and do not ask the user to paste their session cookie. Say that
the scan needs an unauthenticated URL, or audit the component in isolation with
a static fixture the user can open.
