# Library conversion guide — aigovops-july-2026 (M7)

The mechanical recipe for converting every AiGovOps Library page to the estate design
family. Canonical tokens + rules live in the Foundation repo:
`design/aigovops-july-2026/DESIGN-SYSTEM.md` + `tokens.css`. **Reference conversions in
this repo: `docs/index.html` (garden-warm) and `docs/blueprint.html` (almanac)** — diff
them against `main` to see each recipe applied end-to-end.

Family rule: **hub + experience pages → garden-warm; deep reading-room docs → almanac.**

## 0. The Library's own constraints (different from the Foundation site)

1. **Self-contained single files.** Library pages carry their whole skin in their own
   inline `<style>` block(s) and must keep working on `file://`. There is NO shared
   stylesheet — do not add `<link rel="stylesheet">` to a local css file, do not add
   image/asset dependencies (grain = inline SVG data-URI). Convert the page's own
   `<style>` block; you may also edit the `<style id="a11y-universal">` block for pure
   styling fixes (e.g. skip-link text color).
2. Add this exact comment as the FIRST line inside each converted main style block:
   `/* skin: aigovops-july-2026 (garden-warm) — canonical tokens: foundation repo design/aigovops-july-2026/ */`
   (or `(almanac)` accordingly).
3. **Skin only — the never-touch list.** You may touch: the Google-fonts `<link>` and the
   page's `<style>` blocks. You may NOT touch:
   - the `/*BEGIN-SHARED*/ … /*END-SHARED*/` region in `docs/index.html` (generated
     Yes-Gate code) — or any page's inline `<script>` logic;
   - `<script>` tags (jeeves-hero.js, jeeves-widget.js, start-here.js, estate-footer.js)
     — keep them **byte-identical**, including their `data-*` attributes;
   - text content, hrefs/links, ids, classes, aria-* attributes, meta/OG/canonical,
     JSON-LD, comments;
   - **inline `style=""` attributes in the body markup** — never edit them; fix clashes
     from the style block instead (§3).
4. **Gate:** `node scripts/test-library.mjs --dir docs` must be fully GREEN (382 checks:
   per-page h1/body assertions, exactly-one-h1, link/asset integrity, SEO lengths,
   sizes). Do not edit its assertions for a skin change — if one fails, you touched
   something in the never-touch list; revert the markup and fix via CSS. (Only a check
   about pure styling that legitimately changed may be edited — report it explicitly.)
5. **Visual check:** load the page at 1280px and 375px (Playwright over `file://`,
   full-page screenshot, assert `document.documentElement.scrollWidth == 375` on
   mobile), click through any in-page demo UI, and confirm zero console errors on
   `file://` (self-containment proof).

## 1. Footer-injector treatment (the chosen pattern)

`docs/estate-footer.js` stays **byte-identical** (no `data-theme="light"` added — the
script tag is on the never-touch list). Instead, the injector's *dark-mode* path reads
the page CSS vars — `--ink`, `--ink2`, `--green2` (falls back to `--green`), `--line`,
`--card` — so each converted page **repoints those vars to AA-safe values on light
ground** and the footer comes out readable for free:

| Var the footer reads | Garden-warm value        | Almanac value            |
|----------------------|--------------------------|--------------------------|
| `--ink`              | `#2B2B28`                | `#2A2A26`                |
| `--ink2`             | `#4C4A42`                | `#55534B`                |
| `--green2` / `--green` | `--green2:#1F5E3A`     | `--green:#2C4F27` (no `--green2` needed) |
| `--line`             | `rgba(43,43,40,.14)`     | `rgba(42,42,38,.28)`     |
| `--card` (footer bg) | `#fff`                   | `#FBF8F0`                |

All pairs clear 4.5:1 on cream/paper; the one-contentinfo contract is the injector's own.

## 2. Recipe A — garden-warm page (hubs + experience pages)

Ground: cream `#FAF7F0` · cards white · orchard green `#2E7D4F` fills / green-ink
`#1F5E3A` text · warm accents as orange-ink `#9C4E12` text or gold `#E8B54A` fills ·
Fraunces for display (keep it), Source Sans 3 for body (swap the Inter/Segoe body font in
the `<link>` and `body` rule), DM Mono stays for mono.

Palette mapping — **hub teal-dark palette → garden** (apply line-by-line to the `:root`
and every rule; keep all structural properties — grid, padding, font-size — untouched):

| Old (hub dark)                                  | Garden replacement |
|--------------------------------------------------|--------------------|
| `body` radial `#0a3034/#04181a/#03100f`          | flat `#FAF7F0` + inline-SVG paper grain on `body::after` (copy from docs/index.html) |
| `--teal:#01696f`                                 | `#1F5E3A` |
| `--green:#2ecc71` (fills AND big display text)   | `#2E7D4F` — as a FILL force `color:#fff` on the text inside; as TEXT only ≥22px bold / ≥24px (3:1 large-text) |
| `--green2:#6fe6a3` (links, small green text)     | `#1F5E3A` green-ink |
| `--ink:#e7f3f1` (body text)                      | `#2B2B28` charcoal |
| `--ink2:#9fc0bd` (muted text)                    | `#4C4A42` ink-soft |
| `--gold:#e8c25a` as small TEXT                   | `#9C4E12` orange-ink |
| `--gold` as a FILL (pills) with dark text        | keep `#E8B54A` (dark-on-gold ≈8:1 ✓) |
| `--line:rgba(120,200,190,.18)`                   | rules `rgba(43,43,40,.14)` / card borders `rgba(43,43,40,.08)` |
| `--card:rgba(255,255,255,.04)`                   | `#fff` + `box-shadow:0 10px 26px -14px rgba(78,60,32,.3)` |
| headings/`b` `color:#fff`                        | `#2B2B28` |
| `.repo`-style dashed note boxes                  | background `#F1EAD8` deep-cream |
| green/gold `rgba(46,204,113,.05–.13)` washes     | keep — pale tints read fine on cream |
| skip-link `color:#04181a` on `var(--green)`      | `color:#fff` (edit in the a11y block) |

Inline-style clashes (markup untouched — copy these override patterns from
docs/index.html):

```css
[style*="color:#fff"]{color:var(--g-charcoal)!important}          /* white inline text → charcoal */
[style*="background:var(--green)"]{color:#fff!important}          /* pills/buttons on green fill */
[style*="color:var(--gold)"]{color:var(--g-orange-ink)!important} /* gold inline text */
/* terminal/code blocks keep a charcoal panel — dark is load-bearing for code */
[style*="color:#cfeee2"]{background:var(--g-charcoal);border-radius:10px;padding:12px 16px;--green2:#5DCAA5;--ink2:#B9B3A2}
[style*="color:#cfeee2"] [style*="color:#fff"]{color:#fff!important}
```

Script-generated inline colors (demo UIs) get id-scoped overrides, e.g.
`#srrisk [style*="#f0a64a"]{color:var(--g-orange-ink)!important}`. Dark inputs become
white (`#srq{background:#fff!important}`). On-charcoal light-text pairs: `#EDE8DA` /
`#B9B3A2` dim / `#5DCAA5` green / `#E8B54A` gold — all ≥4.5:1 on `#2B2B28`.

## 3. Recipe B — almanac page (deep reading-room docs)

Ground: paper `#F7F3E8` + subtle grain · ink `#2A2A26` · botanical `#3D6B35` (decorative)
/ green-deep `#2C4F27` (text) · **stamp red `#C4482F`/`#A83A24` for badges & section
numbers only** · Fraunces (display) + Source Serif 4 (body), **keep IBM Plex Mono for
genuinely technical content** (code, .key, .tech, nav chips, captions).

Palette mapping — **deep-doc navy/Cinzel palette → almanac**:

| Old (navy deep-doc)                              | Almanac replacement |
|--------------------------------------------------|---------------------|
| `--paper:#0c1430` + `--grid` blueprint gridlines | `#F7F3E8` paper, `--grid:transparent` (drop the grid), add the inline-SVG grain on `body::after` |
| `--paper2:#0a1026` (diagram panel bg)            | **KEEP `#0a1026`** — inline SVG diagrams hardcode navy-tuned colors; frame the panel with `border:1px solid var(--ink)` as a "dark plate". Never edit the SVGs. Captions inside the plate stay light (`.dcap{color:#8da3c8}`). |
| Cinzel (display)                                 | Fraunces |
| Spectral (body)                                  | Source Serif 4 |
| `--ink:#dce6f5`                                  | `#2A2A26` |
| `--ink2:#8da3c8`, `p #cdd9ec`, `li #cdd9ec`      | `#55534B` ink-soft |
| `--teal:#3fd0c8` (eyebrow, h4, .key)             | `#2C4F27` green-deep |
| `--green:#36e08a` (markers, creed, fcreed)       | text `#2C4F27`; decorative markers `#3D6B35` |
| `h2 .n` section numbers (teal)                   | `#A83A24` red-deep (the stamp accent — numbers/badges only) |
| `--gold:#e8c25a` (.tech lines)                   | `#7A5A12` bronze ink (5.7:1) |
| `--line:rgba(120,160,210,.22)`                   | `rgba(42,42,38,.28)` |
| `--card:rgba(255,255,255,.035)` panels           | `#FBF8F0` paper-lift + soft ink shadow |
| header teal-gradient panel                       | paper-lift plate: `border:1px solid var(--ink)`, faint green tint gradient, print-style shadow |
| sticky `nav` navy gradient + blur                | `rgba(247,243,232,.94)` + blur + `border-bottom:1px solid var(--line)`; hover = green-deep on `#E4EADB` tint |
| headings/`b` `#fff`                              | `#2A2A26` |
| skip-link `color:#04181a`                        | `color:#fff` |
| fixed dark "‹ back" pill (inline style)          | override, e.g. `a[href="./index.html"][style]{color:#2C4F27!important;background:rgba(251,248,240,.96)!important;border:1px solid rgba(61,107,53,.55)!important}` |

Sticky nav, numbered sections, anchors, and the back-link must keep working — they're
markup, so they will if you only touch CSS.

## 4. AA pairs (verified — use only these on light ground)

`#2B2B28`/`#2A2A26` on cream/paper ≈13:1 · `#4C4A42` ≥6.3:1 · `#55534B` ≥6.4:1 ·
`#1F5E3A` ≥6.4:1 · `#2C4F27` ≥8:1 · `#3D6B35` 5.6:1 · `#9C4E12` 5.5:1 · `#7A5A12` 5.7:1
· `#A83A24` 5.9:1 · `#fff` on `#2E7D4F` 5.05:1 · `#fff` on `#2C4F27` ≈9:1.
Never: `#2E7D4F` as small text on cream (4.4:1 — large-only), gold `#E8B54A` as text on
light, `#04181a` text on `#2E7D4F`, any of the old light-on-dark values on cream.

## 5. Page assignment (M7)

- **almanac:** control-plane.html · build-tickets.html · plan.html · design-book.html
- **garden-warm:** tour.html · rooms.html · gates.html · watch-gates.html · demo.html ·
  demo-e2e.html · demo-run.html · demo-foundation.html · onboarding.html · board.html ·
  pulse.html · connect.html · failfest.html · f-ai-friday.html · practitioner.html ·
  newsroom.html · durability-plan.html · aigovops-for-quantum/index.html ·
  aigovops-for-quantum/quantum-for-beginners.html
- **done (reference):** index.html (garden-warm) · blueprint.html (almanac)

Pages with dark load-bearing surfaces (live consoles, ledgers, video frames, room
illustrations) keep those as charcoal/navy *panels*; the page chrome around them goes
garden/almanac.

## 6. Ship gate

```bash
node scripts/test-library.mjs --dir docs   # must be GREEN (0 failed)
```

Then the §0.5 visual pass on every converted page. Per the house rules: show Bob the
diff and **ask before committing/pushing** — the skin lands on `main` only on approval.
