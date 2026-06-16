// src/core/residency.js
// DATA RESIDENCY (#10 — data lifecycle). A declared region tag so the system can
// state, and stamp onto exports, WHERE its data lives — the boundary regulated
// customers ask about first. Config-only: DATA_RESIDENCY=us|eu|enclave|… (default
// 'unspecified'). The enclave profile implies the strictest residency (in-perimeter).

export function residencyTag() {
  const region = String(process.env.DATA_RESIDENCY || 'unspecified').toLowerCase();
  const profile = String(process.env.SECRETS_PROFILE || '').toLowerCase();
  return { region, enclave: region === 'enclave' || profile === 'enclave' };
}
