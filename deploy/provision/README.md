# The four go-live steps — turnkey, but yours to run

These are the **irreversible, credentialed moves** the AiGovOps system deliberately
keeps in human hands: creating accounts/keys, provisioning infrastructure, and
changing DNS. The agent prepared each one as a single command; **you** run it and
make the credential entry. (This is the project's own governance principle applied
to its own deployment: *prepare and propose; the human makes the irreversible move.*)

| Step | One command | The irreversible part that's yours |
|------|-------------|------------------------------------|
| **1. 1Password** | `bash deploy/provision/1-onepassword.sh` | sign in to 1Password; create the **service account** in the console |
| **2. Host** | paste `deploy/provision/2-cloud-init.yaml` as VM user-data | create the **VM** in your cloud; export `OP_SERVICE_ACCOUNT_TOKEN` |
| **3. Vault + IdP** | `bash deploy/provision/3-vault.sh` then `bash deploy/provision/3-keycloak.sh` | keep Vault's **unseal key + root token**; set the **Keycloak admin password** |
| **4. DNS + TLS** | run `caddy` with `deploy/provision/4-Caddyfile` | set the **DNS A records** at your registrar |

## Order

```bash
# 1) on your laptop, signed in to 1Password:
bash deploy/provision/1-onepassword.sh
#    then create a 1Password service account in the console and copy its token.

# 2) create a Linux VM, pasting 2-cloud-init.yaml as user-data. SSH in:
export OP_SERVICE_ACCOUNT_TOKEN=ops_...

# 3) on the host, after `bash deploy/bootstrap.sh` brings up vault + keycloak:
export VAULT_ADDR=http://127.0.0.1:8200
bash deploy/provision/3-vault.sh                 # init/unseal + scopes; store the token in 1Password
export KC_ADMIN_PW=...   # the Keycloak admin password from your stack
bash deploy/provision/3-keycloak.sh              # import the aigovops realm; rotate the client secret -> 1Password

# 4) point DNS at the host, then:
docker run -d --name caddy --network host \
  -v $(pwd)/deploy/provision/4-Caddyfile:/etc/caddy/Caddyfile -v caddy_data:/data caddy:2
```

## Why the agent stops here

It has no 1Password session, no cloud account, no Docker on its machine, and no
registrar access — and even if it did, CLAUDE.md forbids creating accounts,
enrolling keys, entering credentials, or changing DNS autonomously. Everything
*up to* those actions — the stack, the automation, the secret flow, the realm and
Vault wiring — is code in this repo and validated in CI. These four scripts make
the human part one command each.
