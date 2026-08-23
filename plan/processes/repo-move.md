# Process — moving a repository (the half a machine may do)

*Rule of record for transferring, renaming and re-homing a repository. D3 of
[`plan/MASTER-PLAN.md`](../MASTER-PLAN.md). Engine: `scripts/repo-move.mjs` · tests:
`test/repo-move.test.mjs`.*

---

## The three commands

```
npm run repo:move                     # preflight — what breaks, and the click-path
npm run repo:move -- --verify --from owner/repo --to owner/repo
npm run repo:move -- --apply  --to owner/repo --pages-url https://.../
```

---

## What is automated, and what is not

**Not automated, and not automatable from here:** the transfer, the rename, and enabling Pages.
Three independent reasons, the first alone decisive:

1. **There is no transfer or rename tool** in this session's GitHub surface. They are
   admin-settings operations and nothing here reaches them.
2. **Scope.** The session is scoped to this repository; the source repo is not attached, and
   attaching one grants read or push — never admin.
3. **Policy.** `policies/autonomy.yaml` classes `transfer-rename-or-archive-a-repository` and
   `change-access-control-or-repo-settings` as **red**: a human does them, with their own hands
   and their own credentials.

**Automated:** proving the move is safe to make, and every reversible thing afterwards. That is
the same shape the estate's deploy agents already use — drive right up to the irreversible
click, then stop.

---

## Why Pages is the whole problem

GitHub redirects a rename or transfer for `github.com/…` URLs and for git remotes. It does
**not** redirect Pages. This estate has already paid for that lesson once: 138 references 404'd
after the org move, including a QR code printed on a presentation slide.

So every reference to a Pages URL has to be classified before the move, and there are only two
kinds:

| Kind | Can it be repointed in advance? |
|---|---|
| `<a href>` | **Yes** — point it at the `github.com` repo URL, which survives both moves. |
| `<iframe src>` | **No.** GitHub sends `X-Frame-Options: deny`, so the panel renders **blank**. |

A silent blank is worse than a 404 because nobody reports it. An iframe reference is therefore a
**blocker**: it can only be repointed once the new Pages URL exists, and `--preflight` names it
rather than letting it be discovered later.

---

## How `--verify` knows

`git ls-remote` against both slugs. If the old one answers with the **same head** as the new one,
the redirect is live — that is proof, not an assumption. If it answers with a *different* head,
something else has taken the old name and the redirect is gone, which is worth failing loudly on.

---

## What `--apply` deliberately leaves undone

It repoints the iframe and updates the manifest, but it does **not** turn on the crawl for the
moved property. Enabling a crawl against a URL that 404s teaches everyone to ignore a red board —
the same failure the nightly library test hit when it checked a page that no longer existed in
that form and cried wolf until nobody read it.

Turn `crawl.enabled` on once the new Pages URL actually serves, then `npm run estate:regen`.

---

## A note on the order

`--apply` was dry-run against the real tree before it shipped, and the dry run caught a bug:
it renamed the repository's `id` in `estate.yaml` without updating the site row that references
that id, leaving the manifest referentially broken. The estate gate would have caught it — but
only after a bad commit. Dry-run it again if the script changes.
