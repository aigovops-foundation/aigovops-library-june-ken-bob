# Process — Release

**Discipline:** Release & publish · **Room:** CI/CD · **Owning agent:** Deploy · **Skill:** `aigovops-deploy-workflow + github-pages-publish`

> Take an approved change live — including this very webpage.

## Trigger
An approved change is ready to go live.

## Repeatable steps  *(the agent does the bureaucracy)*
1. Branch; run the Cloud-Mary gate; commit.
2. Open a PR via the API; squash-merge on green.
3. Publish the GitHub Pages site; sync back.
4. Prepare DNS / registrar / Pages-toggle values for the human.

## Human gate  *(humans hold the meaning)*
BOB / KEN make the irreversible click (repo create, first push, Pages on, DNS).

## Evidence — the receipt
Beacon emits a metadata-only **`artifact`** receipt: `kind, actor, action=release, ref, url, contentHash`. Signed Ed25519, appended to the append-only ledger, verifiable with `openssl`. **No payloads, ever.**

## Done = Yes
Change live; release receipt signed; Herald reports it. Then it enters **Stay at Yes** (Sentinel watches); on drift/incident it runs **Recover to Yes**.

## Always
Output ships in the member's locale (English-first) and, where user-facing, meets **WCAG 2.2 AA**.
