# Documentation build — the manual and the hosted guide

Rebuilds the two PDFs from live screenshots:

| Output (gitignored) | Covers |
|---|---|
| `docs/Synthograsizer-Manual.pdf` | A **local install** — every feature switched on |
| `docs/Synthograsizer-Hosted-Guide.pdf` | **synthograsizer.com** on a free-tier account |

The PDFs are output, not source: ~7 MB of binaries that regenerate in about a
minute, so `.gitignore` keeps them out. The written copy lives in the two
`build_*.py` files, which is what to edit when the wording is wrong.

## Requirements

Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` (edit `CHROME`
if yours is elsewhere), Node 22+ (uses the built-in `WebSocket` — no npm
dependencies at all), and `reportlab` + `Pillow` for the PDF itself.

## Why Chrome over CDP rather than the browser extension

The extension's screenshot tool cannot write to disk — `save_to_disk: true`
produced no local file anywhere under the user profile, because the ids it
returns are server-side handles. A PDF needs real files, so these scripts drive
their own Chrome over the DevTools Protocol instead.

## Rebuilding the local manual

Needs `python -m backend.server` on :8000. Start the ChatRoom backend too
(`node chatroom/server/index.js`) or the Workflows screenshot captures the
offline state rather than the template grid.

```bash
node scripts/manual/capture2.mjs ./shots2 && python scripts/manual/build_manual.py
```

Headless, throwaway profile, first-run defaults — so the screenshots show what a
new user sees rather than whatever state the operator left behind.

## Rebuilding the hosted guide

Two phases, because it needs a signed-in session and **these scripts must never
handle credentials**:

```bash
node scripts/manual/hosted_launch.mjs
```

That opens a *visible* Chrome with its own throwaway profile. Sign in by hand in
that window, then:

```bash
node scripts/manual/capture_anon.mjs && node scripts/manual/capture_signedin.mjs && python scripts/manual/build_hosted.py
```

`capture_anon.mjs` runs signed-out on purpose — the anonymous visitor is a real
section of the guide. Costs nothing. `capture_signedin.mjs` costs nothing
either; only a real generation spends credits, and that is a separate step.

### Privacy

`capture_signedin.mjs` rewrites any email in the DOM to `you@example.com`
immediately **before** each screenshot — text nodes, input values and `title`
attributes. Redacting at capture time rather than blurring afterwards means the
real address is never written into a PNG at all. It logs how many nodes it
changed per shot; if that count is ever 0 on the account-menu shot, something
moved and the shot needs checking by eye before the guide ships.

## Two traps

**Never use characters the built-in PDF fonts lack.** ReportLab's Helvetica has
no glyph for arrows, emoji, or the lightning bolt used for credits — they render
as solid black boxes, and the build succeeds silently. Both PDFs shipped that way
once. Spell them out (`Left / Right`, `Download`, `5 credits`). Check with:

```bash
python -c "import pypdf,re; t=''.join((p.extract_text() or '') for p in pypdf.PdfReader('docs/Synthograsizer-Manual.pdf').pages); print(sorted(set(re.findall('[\u2190-\u21ff\u2600-\u27bf\U0001f000-\U0001faff]', t))) or 'clean')"
```

**A scene helper that ends in `return` short-circuits its own scene.** The
modal-closing prefix originally ended with `return 'closed'`, so five scenes
captured a closed dialog and reported success. If a scene's log line reads like
the prefix rather than the action, that is what happened.
