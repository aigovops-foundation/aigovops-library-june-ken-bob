# The estate review — findings, fixes, and the plan

*2026-07-19. Six independent read-only sweeps (security · editorial honesty & SEO ·
accessibility · code health · governance integrity · ops/scale/cost) across all ten repos
and both droplets. Every finding below was verified by its reviewer, not asserted. ~60
findings; 14 already fixed and shipped the same night.*

**The pattern worth naming:** the things that were *designed* were designed carefully. The
things that were *assumed* — offsite backup, alert delivery, failover ingress, the CI lint
that "proves" no ungated effects exist — were never checked, and none of them work.

---

## Wave 0 — Already fixed and live (`a4704cb`, `cdd6b19`)

| # | Finding | Fix |
|---|---|---|
| 1 | **Ledger tamper-evidence defeatable without the key** — `verify_chain()` skipped unsigned records; `prev` is recomputable, so history could be rewritten wholesale. *Demonstrated: approve→remove, chain rebuilt, still verified True.* | Every record must carry a valid signature; malformed lines return False. New ledger-integrity lane (13 checks) that attacks the property. |
| 2 | **Live session tokens world-readable** (`sessions.json`/`magic_links.json` 0644, real non-root shell user on the box). A session id *is* the account. | `chmod 600` on the droplet + `os.chmod` on the temp file in `auth._save()` (the rename reset the mode every write). |
| 3 | **`/api/options` served the draft queue + donor list to anonymous** — 24 in-flight drafts and real contributions. | Steward-gated. The test that asserted member access was asserting the bug. |
| 4 | **Ungated external email from a verdict-1 effect** — `day2_notes` mailed the whole membership from inside the "self-cleaning synthetic drill". | Routed through `mediator.perform` as its own gated `day2_note`; OFF unless `OMNI_DAY2_NOTES=1`. |
| 5 | **Money with no amount earned verdict 1** — unpriced `purchase` auto-approved. | Missing amount = unbounded → fails closed. |
| 6 | **The battery never ran the governance core** — `tests/run.py` doesn't match `test_*.py`, so receipts/double-spend/hold-decay were never exercised by the gate we ship on. | Globbed in + 600s per-suite timeout. |
| 7 | Missing `nosniff` / HSTS / `Referrer-Policy` (nosniff load-bearing: `/api/avatar` serves member bytes). | Added at the `end_headers` chokepoint. |
| 8 | `/api/join` had no honeypot and only the 90/min generic cap → steward phone-flood. | Honeypot + per-IP hourly cap, success-shaped. |
| 9 | `certify.html`/`verify.html` escapers missed the apostrophe. | Fixed. |
| 10 | **`uptime_probe` had no facts deriver → verdict 0 → the probe was BLOCKED in production.** | Deriver added (`_internal`); `day2_note` classified `_email`. |
| 11 | **My fleet audit wrongly retired 9 of 12 agents** — the classifier looked for `effectors/<agent>.py`, but they register from shared modules. | Classifier now asks the broker registry. 40 active, 2 truly retired. |
| 12 | **standards.html told members the ledger holds "never your personal details"** — it holds 52 emails, 38 names, 23 question texts. | Wording corrected to say exactly where it isn't metadata, and that an append-only log can't be edited. *Code fix queued — see W1-4.* |

---

## Wave 1 — Before beta invitations go out

*These are the ones where inviting strangers first makes the problem worse.*

### W1-1 · Kill the CPU thief (Bob, 1 min)
`hermes setup` (PID 1702) has held one of production's two cores at 99.9% for **32 days** —
not a systemd unit, an orphaned interactive wizard. Production is running at half capacity.
**Fix:** confirm nothing depends on it, `kill 1702`. Doubles prod CPU for free.

### W1-2 · Get a backup out of nyc1, and make the fake control read red (Claude + Bob)
Both droplets are in **nyc1**. `OMNI_BACKUP_REMOTE` is unset, `rclone` isn't installed, and
**`offsite-backup` has been reporting success daily while copying nothing**. A control that
reports healthy while absent is the most dangerous kind.
**Fix:** (a) Bob creates a DO Space in another region + pastes two broker keys
(`backup-s3-key`, `backup-s3-secret` — the code path already exists); (b) Claude makes
`offsite-backup` **return an error** when no remote is configured, so absence reads red;
(c) `apt install rclone`.

### W1-3 · Fix the auth hot path before load touches it (Claude, M)
`members_db._query` runs `ensure_schema()` on **every query** — `ALTER TABLE` takes an
ACCESS EXCLUSIVE lock — and every call opens a fresh connection (no pool, `max_connections
= 100`). Measured: the real query is **0.09 ms**; the hot path is **10.7 ms** — a 118× tax
on the endpoint gating every authenticated page view. **When connections exhaust,
`is_active_member` returns False and members are silently logged out** while `store` falls
back to *June* file data.
**Fix:** hoist `ensure_schema` to a `_ready` flag (the pattern `PgStore` already uses); add
a connection pool; bound the thread pool; make the `FileStore` fallback loud or remove it.
One announcement to ~1,000 people triggers this — not 10,000 members of steady traffic.

### W1-4 · Stop writing PII into the append-only ledger (Claude, M)
52 records carry a real email, 38 a name, 23 free-text questions — because
`principal_for_email()` uses the full address as the principal. RTBF pseudonymises the
member record while the ledger keeps their email **permanently and unerasably**.
**Fix:** write `principal_hash(principal)` into ledger entries (the helper already exists
and is used this way for avatar filenames); keep the email↔hash mapping in the member
store where RTBF can delete it; drop `concierge`'s `q` field to a length/topic. Forward
fix — the 64 existing entries need a founder decision (documented exception vs. a
key-rotation boundary).

### W1-5 · The RTL blank page (Claude, S — one CSS rule)
Arabic and Urdu render **completely blank**, and the choice persists in `localStorage`, so
every subsequent visit is blank too. Cause: `.omni-skip{left:-9999px}` becomes 9,999px of
overflow when the inline axis flips.
**Fix:** replace with the direction-neutral clip pattern
(`clip-path:inset(50%)`), then grep the estate for other `-9999px` hacks.

### W1-6 · The invisible keyboard trap (Claude, S — one attribute)
33 of 47 focusable elements on every page live inside the *closed* Jeeves panel
(`opacity:0` but still focusable). Keyboard users tab into nothing; screen readers read the
whole closed panel including a 20-link site map.
**Fix:** `inert` on the panel while closed.

### W1-7 · Delete the phishing-training page (Claude, S)
`docs/demo-run.html` publishes a raw host IP and instructs stewards to *"accept the
self-signed cert, paste a steward token"* — on a public page. That is training your own
people to hand a token to a man-in-the-middle.
**Fix:** delete the link and caption. If a live demo is wanted, put it behind a real DNS
name with a real certificate.

### W1-8 · The fabricated signers (Bob's call, Claude executes, S)
`pledge.js` ships `BASELINE = 247` and **six invented named residents** ("Maria, Student,
Wenatchee") presented as real neighbours — with zero actual signers. Published by a
501(c)(3) whose product is evidence integrity, and contradicting its own Pledge point 5
("We disclose. Always.").
**Fix:** `BASELINE = 0`; delete the seeded wall or relabel it "illustrative personas";
hero → "Be the first to sign."

### W1-9 · Rotate the leaked key (Bob, S)
`aigovops-library/keys/private.pem` — a real Ed25519 private key, **in HEAD of a public
repo** since 2026-06-08 (`.gitignore` only covered `core/keys/`). Bounded: it's a stray dev
keypair, not the production anchor.
**Fix:** rotate the beacon keypair; add `keys/*.pem` to `.gitignore`; purge from history
(rewrite — founder only); re-anchor anything signed with it.

### W1-10 · Certification dead-ends strangers (Claude, S)
`certify.html` sells hard — "Free · retry anytime · Start the assessment →" — then a signed-
out visitor gets a grey, unlinked *"Please sign in to do that."* Maximum intent, zero path.
**Fix:** actionable link to `signin.html?next=certify.html` in a `role="alert"`, focus
moved; or gate the CTA up front ("Free — sign in to start").

---

## Wave 2 — Before scale (the 1,000-member cliff)

| # | Finding | Fix | Size |
|---|---|---|---|
| W2-1 | **Every store collection is one JSONB row**; `update()` holds `FOR UPDATE` on it. A broadcast at 1k members = **34 s serialized**; at 10k = **48 min of held lock**, ceiling 3.5 writes/sec. | Give `notifications` (then `drafts`) the `omni_members` treatment: one indexed row each. `members_db.py` is the template. | M |
| W2-2 | **One hung job freezes all 23 schedules forever** — `Type=oneshot` + `TimeoutStartUSec=infinity`, and the watchdog (`ops-checkup`) is *inside* the thing it watches. | `TimeoutStartSec=900`; wrap `pipelines.run`/`workflows.run` in try/except so an exception becomes `status="error"`; move tick-liveness to droplet B's watchdog. | S |
| W2-3 | **~30 read-modify-write sites bypass `store.update()`** — classic lost update on a threaded server with a fleet tick and a Telegram bot writing concurrently. | Mechanical conversion to the atomic primitive that already exists. | M |
| W2-4 | **Certification attempts can be double-scored** (TOCTOU, in-process on `ThreadingHTTPServer`) — best-of-N defeats the one-shot promise the badge rests on. | `store.update("cert_attempts", fn)`. | S |
| W2-5 | **Teach B's watchdog more than "homepage returns 200."** Right now: full outage → Telegram in 6 min; Postgres down, disk filling, tick stopped, backups stale, connections exhausted → **silence**. | Add three probes to the existing 40-line bash: tick staleness >45 min, newest backup >30 h, an authed health endpoint that touches Postgres. | S |
| W2-6 | **RTO 4–8 h, RPO 24 h.** B can't take ingress (no cloudflared, no tunnel creds); Postgres has `archive_mode=off` so up to 24 h of member data and ~13 h of ledger exist nowhere but A. | Install cloudflared + stage tunnel creds on B; `OMNI_ROLE=standby` in B's env (the single-writer fence is currently disengaged there); WAL archiving to the offsite bucket drops RPO to minutes. | M |
| W2-7 | The app **runs as root** — 2,231 lines of hand-rolled HTTP + Pillow parsing attacker-supplied images. Any bug is instant root on the box holding every member's data and the gate key. | Dedicated unprivileged user; `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, `ReadWritePaths`. | S |
| W2-8 | **1Password action pinned to a mutable tag** (`@v4`) with `OP_SERVICE_ACCOUNT_TOKEN` in scope — a tag re-point exfiltrates the estate's canonical secret store. | SHA-pin. Roll Omni's pinning convention to the other four repos. Delete beacon's committed presigned URL + `postinstall` shell-out. | S |
| W2-9 | **Cold-start race can orphan the gate key** — three processes start together, two can both generate, last write wins; receipts signed under the loser never verify. | `flock` or `O_CREAT\|O_EXCL` + re-read. Pairs with escrow. | S |
| W2-10 | `members.get()` / `by_status()` / `count()` full-scan on the file backend; `ORDER BY created_at` ties are non-deterministic (every migrated member shares a timestamp) so pagination can duplicate and skip. | Indexed `get`; `ORDER BY created_at, id`. | S |
| W2-11 | Rate limiter never evicts — one entry per source IP, forever. | Opportunistic sweep of empty deques inside the existing lock. | S |
| W2-12 | Auth is tested almost entirely in **dev mode** (only 23 of ~150 suites set `OMNI_AUTH_REQUIRED=1`), and the **Postgres backend has never been executed by any test**. | Flip `OMNI_AUTH_REQUIRED=1` as the battery default and expect honest failures; add a Postgres service container to CI. | M |

---

## Wave 3 — Truth and reach (the credibility pass)

**Overclaiming — every one of these is a number the estate cannot back:**

| Claim | Reality | Where |
|---|---|---|
| "500+ curated frameworks · 10,000+ experts" | **40** frameworks, no expert body | Foundation homepage LinkedIn feed |
| "Compile 40+ frameworks" | **2** OSCAL catalogs | Umbrella site |
| "Live evidence · 147 controls · NIST 94%" + a Rekor log index | **4** control YAMLs, no Rekor entry, no disclaimer | Umbrella — *and the aria-label says "Live evidence telemetry", so it lies to screen readers too* |
| "35 agents · newsletter to 1,240 members" | 40 agents / **0** active members | jeeves-console.html |
| "100 tips · Top 100 registries" | **3** tips, empty registries | Glean README |
| "All 35 mini-camps" | **11** written (*the site itself is honest — only the README overclaims*) | NCW README |
| Beacon README repo map | describes React/Vite code that doesn't exist | Beacon README |

**Fix pattern:** state the real number and the roadmap beside it — "2 framework catalogs
shipped · 38 on the registry roadmap" is *more* persuasive than a number a reader can
falsify in one click. `beacon/BENCHMARKS.md` already does this correctly (hardware-scoped
numbers + an explicit "what's not measured yet"); copy its tone everywhere.

**Broken promises:** "a founder welcomes you personally — usually quickly" (0 active
members, 9 pending) → *"A founder reviews every new member by hand."* · `signin.html` shows
three contradictory promises on one screen · Umbrella's quickstart installs a package that
**does not exist on PyPI** · Beacon's quickstart pulls a nonexistent Docker image and
`npm install`s at a root with no `package.json`.

**Dead links:** Beacon's and Umbrella's **first README link both 404** (stale
`bobrapp.github.io` — Pages doesn't follow repo-rename redirects), *including a QR code
printed on a presentation slide* · **the Library's entire sitemap is dead — 22 of 23 URLs
404, and every canonical points at them**, which drops the Library from search entirely ·
`help@aigovops.org` **has no MX record** while `help.html` promises a reply in two working
days.

**Consistency:** the creed exists in **five variants**; `blueprint.html` says "humans hold
*moral legitimacy*" — the keys clause is the governance claim and half the instances drop
it. Three foundation domains and three contact domains in play. The **501(c)(3)** and
**WCAG 2.2 AA** claims are asserted in bold and unverified — confirm the determination
letter and link an audit, or soften.

**SEO:** NCW has **zero** canonical/OG/Twitter tags across 12 pages — every LinkedIn share
of the event site renders as a bare grey link (*highest-ROI fix in the audit*) · the
community portal's back-of-house shells (`portal`, `console`, `review`, `mission-control`)
are **crawlable and indexable** · only `landing.html` has a canonical · Glean's `og:image`
is a cross-domain photo of two men on a *curriculum* share.

**Governance wording:** the library site promises **Ed25519 and "verification needs nothing
but a public key and openssl"** — the ledger is **HMAC-SHA256**, symmetric, with the key on
the same box as the ledger it signs. No third party can verify anything. *Either implement
detached Ed25519 signing (real work, real differentiator) or change the sentence.* Also:
`human_reviewed` is read straight off the agent's own payload (`facts.py:42`) — the one
load-bearing fact in the publish rule is the one thing the agent asserts about itself; and
`_newsletter` **defaults it to True**. And "a member sees only their own effects" describes
per-identity scoping that doesn't exist (domain scoping does) — zero exposure today
because `OMNI_MEMBERS` is empty, but fix the sentence or build the filter.

**Audit trail:** gate receipts carry **no `action_hash`**, so a decision cannot be
cryptographically joined to the action it authorised — only guessed by timestamp. One-line
fix, and it's the whole point of an audit trail.

---

## What holds — worth saying, and worth marketing

The `?` decay is **real**: time-based, cross-process, on a live timer, with **seven
production records** of holds failing closed at their deadline. The co-founder/steward split
on the kill switch and role admin is correctly enforced at every endpoint. The broker's
receipt discipline is sound — nothing that reaches it gets past it. Middle-of-file tampering
*is* caught, including the sophisticated version that repairs the hash chain. Unknown
effects fail safe to 0 in production. `corpus_ref` on every decision is better than industry
practice. The 100-case harm corpus is real, sourced, and tribunal-cited. Every page
server-renders real text — **nothing goes blank without JS**. The membership wall is
correctly enforced. `members_db.py` anticipated and closed a SQL-injection hole before it
existed. And the estate's own comments are honest: `backup.py`'s essay calls its current
safety "accidental" and explains exactly how it would break.

**Two of these — the `?` decay and the harm corpus — are genuinely differentiated and
neither is marketed.** That is the cheapest win on this page.

---

## Sequencing

```
NOW (tonight, ~2h)      W1-1 kill hermes · W1-5 RTL · W1-6 inert · W1-7 phishing page
                        · W1-8 fabricated signers · W1-10 cert dead-end
BEFORE INVITES (~1 day) W1-2 offsite backup · W1-3 auth hot path · W1-4 ledger PII
                        · W1-9 rotate the leaked key
BEFORE SCALE (~1 week)  W2-1 notifications table · W2-2 scheduler · W2-5 watchdog probes
                        · W2-7 drop root · W2-8 SHA-pin · W2-4 cert TOCTOU
THE CREDIBILITY PASS    Wave 3, in order: dead links → overclaiming → Ed25519 sentence
(~2 days, mostly copy)  → creed unification → NCW OG tags → portal canonicals
```

**Owner split.** Claude can do W1-3, W1-4, W1-5, W1-6, W1-7, W1-10, all of Wave 2 except
the droplet-level ops, and all of Wave 3's copy and markup. Bob owns: killing hermes,
creating the offsite bucket + two credential pastes, rotating the leaked key, the
501(c)(3)/WCAG verification, and the decision on how to handle the 64 existing PII ledger
entries.

**The one-line summary:** *the governed core is well built; the ungoverned paths around it
are where everything happens.* Wave 1 closes the paths that touch real people; Wave 2
closes the ones that break under growth; Wave 3 makes the public claims true.
