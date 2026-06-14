---
name: op-github-deploy
description: >
  Wire and operate the 1Password → GitHub Actions secret connection for the AiGovOps
  Library repo, and ship workflow/config changes that use it. Use when connecting
  1Password to CI, adding or editing a GitHub Actions workflow that loads secrets,
  referencing op:// secrets in a job, or deploying a change that depends on a brokered
  credential. Trigger on "deploy the 1Password connection", "wire 1Password to GitHub",
  "add a secret to the workflow", "load secrets in CI", "op://", "service account token".
run: handler:op-github-deploy
---

# op-github-deploy — 1Password → GitHub Actions, the governed way

This skill encodes the **VaultProvider hand-off** from `plan/control-and-deployment.md` and
`plan/build-tickets.md`: GitHub Actions pulls secrets from 1Password at runtime via the
official action, and **no secret ever lives in the repo**. It exists so the procedure runs
the same way every time, with exactly one human approval and a hard credential boundary.

## The boundary (never crossed)

- The agent **only ever writes `op://` references** (e.g. `op://AiGovOps/<item>/<field>`)
  and the workflow YAML around them. It **never** types, reads, stores, commits, or echoes
  the `OP_SERVICE_ACCOUNT_TOKEN` or any secret value.
- Adding the token to GitHub repo secrets, granting the service account vault access, and
  setting token expiry are **human steps** — the agent links to them and waits, never does
  them.
- Per the repo's `CLAUDE.md`: prepare and propose; the human approves the commit/push. One
  approval, not zero.

## Facts this skill assumes (verify against the live integration)

- Vault: **`AiGovOps`**. References look like `op://AiGovOps/<item>/<field>`.
- Action: **`1password/load-secrets-action@v4`**. v4 service-account auth uses the
  1Password SDK (no CLI install). **Mac/Linux runners only — not Windows.**
- Auth: a repo secret named exactly **`OP_SERVICE_ACCOUNT_TOKEN`**, passed to the action
  via `env`.
- The service account must be **granted read access to the `AiGovOps` vault** — otherwise
  every load fails closed.
- **Every referenced item must physically live in the granted vault.** A `connection-test`
  in your Private/personal vault is invisible to the service account even if it has the
  right fields. The SA reads *only* the vaults it was granted.
- **`op://` resolves on the field's LABEL, not the value you typed.** When you add a field
  in 1Password and don't rename it, its label defaults to `text`. So a note showing
  "text: value" is addressed as `op://.../item/text`, **not** `op://.../item/value`. Either
  rename the field's label to match the reference, or point the reference at the real label.
  This connection was proven green (op-secrets-check run #2, 2026-06-06) only after renaming
  the field label from `text` to `value`.

## Procedure

1. **Sync.** `git fetch origin main && git checkout main && git merge --ff-only origin/main`.
2. **Write/verify the workflow.** Create or edit `.github/workflows/op-secrets-check.yml`
   (the proof-of-connection job) or the target workflow. Use `@v4`, pass
   `OP_SERVICE_ACCOUNT_TOKEN` via `env`, reference secrets as `op://AiGovOps/...`. Never
   inline a secret value.
3. **Lint mentally / build.** Confirm YAML is valid and references resolve to items that
   exist in the vault. If an item is missing, say so — don't invent one.
4. **Stage + show.** `git add -A`; print `git diff --cached --stat` and the workflow body.
5. **One approval.** Present the diff and ask the human to approve commit + push. On
   approval: commit (`type: summary`), push to `main`. On anything else: stop, leave staged.
6. **Verify.** After push, the workflow is `workflow_dispatch` — tell the human to run it
   once from the Actions tab and confirm the masked "ok". Never print secret values; the
   action masks them in logs by design.

## Preconditions checklist (surface these; do not perform them)

Before the connection can work, the human must have:
- [ ] a vault named `AiGovOps` (or told the agent the real name to use in references);
- [ ] at least one item **in the `AiGovOps` vault** to read (e.g. a Secure Note
      `connection-test` with a field whose **label** is exactly `value`, not the default
      `text`);
- [ ] granted the **GitHub Actions** service account **read access** to that vault;
- [ ] added `OP_SERVICE_ACCOUNT_TOKEN` to the repo's Actions secrets;
- [ ] set a token **expiry** and a rotation date (avoid "doesn't expire").

If any box is unchecked, the agent ships the workflow but states plainly that the run will
fail until the box is checked — it does not paper over a missing precondition.

## First-run troubleshooting (real failures seen, with the fix)

The job log bisects the problem for you. The line **`Authenticated with Service account.`**
means the **token and vault grant are both fine** — anything that fails *after* that line is
a reference / field / vault-location problem, never a credentials problem. Don't go re-doing
the token when the log already authenticated.

- **`could not read secret 'op://AiGovOps/connection-test/value': item ... does not have a
  field 'value'`** → the field's label doesn't match the reference. Open the item in Edit
  view; the label box (not the value) is what `op://` uses. Default-added fields are labeled
  `text`. Rename the label to `value` (or change the reference to the real label), save,
  re-run. No code change needed if you rename the field.
- **`isn't a vault` / item-not-found, yet the item clearly exists** → it's in the wrong
  vault. Confirm the item lives in `AiGovOps` (the granted vault), not Private. Move or
  recreate it there. Watch for duplicate items with the same name across vaults.
- **`401` / auth failure on the load step** → the repo secret `OP_SERVICE_ACCOUNT_TOKEN` is
  stale. Most common cause: the service account was recreated (new token, new ID), so any
  previously-stored token is dead. Re-copy the current token from the SA's auth-token item
  and update the GitHub repo secret. (Human step — the agent never touches the token.)

To re-run after a 1Password-only fix (rename/move), just hit **Run workflow** again — the
workflow body doesn't change, so no PR is needed.

- Rotate the service-account token on schedule and on any departure; update the registry's
  `last_rotated`.
- To cut CI access instantly, revoke the token in 1Password — the next workflow run fails
  closed. No repo change needed.
