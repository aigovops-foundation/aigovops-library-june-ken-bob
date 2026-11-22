# Estate findings

Things I noticed while reading the repos. Each one is checked against the files themselves.

1. **Licence claim vs. LICENSE files.** The site says 'all Apache-2.0'. But `aigovops` (the trunk) has an MIT LICENSE, `openclaw-installer` adds the Commons Clause (not open source), and `ai-artistic-agent-aigovops` / `ai-stay-home-jia-aigovops` / `aiupdates` say MIT.
2. **Stale links to the old homes.** READMEs still point to `aigovopsfoundation.org`, `aigovops.org`, `bobrapp/aigovops-beacon`, `bobrapp/openclaw-installer` and `bobrapp.github.io/Aigovops-Foundation-Open-Source-V4-10k`. estate.yaml notes that GitHub Pages does not follow repo-rename redirects. **Fixed 2026-10-10:** repointed in every active repo; the archived repos were left as they are.
3. **Domain sprawl.** estate.yaml lists www.aigovops-foundation.com (canonical), aigovops-foundation.org, a-i-gov-ops.com (competing copy, D2), aigovops.org (no MX, but named on pages) and aigovops.community (mail). Since 2026-10-10 every contact address uses aigovops-foundation.com, and its mail routes through Cloudflare. aigovops.org survives only in schema and predicate URIs, which are identifiers and must not change.
4. **Five receipt implementations.** Beacon (Ed25519+JCS), One Receipt (spec), REPLAY (SHA-256 chain), Review Framework (HMAC chain) and openclaw (SHA-256 chain). One Receipt's ADOPTION.md and the estate map both point toward converging on the OVERT envelope.
5. **Foundation work in the personal account.** ai-bob-setup-agent, aiupdates, the clean-room agent and justice-league are Foundation-branded but owned by bobrapp. The trunk was moved to the org on 2026-08-23; these four were not.
6. **Unpublished packages.** umbrella-conformance (PyPI), aigovops-lantern (PyPI) and @aigovops/* (npm) are not published yet; the READMEs say to install from source.
7. **Beacon lab inventories keep old owner addresses.** `bootstrap` seeds only empty tenants, so labs that already had data still show the old `@aigovops.org` sample owners. An admin reset updates them but wipes trainee work; the fix would be a narrow, idempotent migration that matches only the known old seed addresses.
8. **OpenClaw's tamper check already reports 4 workflow files.** `.canary-manifest.json` has stale hashes for four workflow files on `master`. This predates 2026-10-10 and means the weekly check is noisy until someone refreshes those hashes on purpose.
9. **Private-repo CI depends on the Actions budget.** With a $0 cap, Omni's CI simply did not start. The cap is now $10/month with "stop usage" kept on.

Generated from repo READMEs, estate.yaml and the GitHub API on 2026-10-11.
